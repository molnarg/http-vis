Packet = window.Packet
HTTPParser = window.HTTPParser

packet_begin = (packet, bandwidth) -> packet.timestamp - packet.size / bandwidth

window.Capture = class Capture
  constructor: (pcap) ->
    @pcap = new Packet.views.PcapFile(pcap)
    @streams = []

    tcp_tracker = Packet.stream.tcp()
    tcp_tracker.on 'connection', (ab, ba, connection) => @streams.push new Stream(@, ab, ba, connection)
    @pcap.packets.forEach (packet, id) =>
      packet.id = id
      packet.timestamp = packet.ts_sec + packet.ts_usec / 1000000
      tcp_tracker.write packet

  clients: ->
    _.uniq (stream.src.ip for stream in @streams when stream.transactions.length isnt 0)

  servers: ->
    _.uniq (stream.dst.address for stream in @streams when stream.transactions.length isnt 0)

  transactions: ->
    _.flatten (stream.transactions for stream in @streams)

  filter: (client, server) ->
    filtered = Object.create Capture.prototype
    filtered.pcap = @pcap
    filtered.streams = []
    for stream in @streams
      if (not client or stream.src.ip is client) and (not server or stream.dst.address is server)
        filtered.streams.push(stream)
    return filtered

  packets: ->
    packets = _.flatten(transaction.packets for transaction in stream.transactions for stream in @streams)
    return _.sortBy packets, (packet) -> packet.timestamp

  packets_in: ->
    packets = _.flatten(transaction.packets_in for transaction in stream.transactions for stream in @streams)
    return _.sortBy packets, (packet) -> packet.timestamp

  packets_out: ->
    packets = _.flatten(transaction.packets_out for transaction in stream.transactions for stream in @streams)
    return _.sortBy packets, (packet) -> packet.timestamp

  first_packet: ->
    @packets()[0]

  last_packet: ->
    packets = @packets()
    return packets[packets.length - 1]

  begin: (bandwidth) -> packet_begin @first_packet(), bandwidth
  end: -> @last_packet().timestamp
  duration: (bandwidth) -> @end() - @begin(bandwidth)

  bandwidth: ->
    packets = @packets_in()
    window_size = 0.3
    window_begin = 0
    window_bytes = 0
    max_bandwidth = 0

    for window_end in [0..packets.length - 1]
      window_bytes += packets[window_end].ethernet.byteLength

      while window_size < packets[window_end].timestamp - packets[window_begin].timestamp
        window_bytes -= packets[window_begin].ethernet.byteLength
        window_begin += 1

      if window_begin is 0 then continue

      current_bandwidth = window_bytes * 8 / window_size / 1000
      max_bandwidth = current_bandwidth if current_bandwidth > max_bandwidth

    return Math.ceil max_bandwidth

class Stream
  constructor: (@capture, ab, ba, connection) ->
    @src = ip: connection.a.ip, port: connection.a.port, address: connection.a.ip + ':' + connection.a.port
    @dst = ip: connection.b.ip, port: connection.b.port, address: connection.b.ip + ':' + connection.b.port
    @transactions = []
    @domain = undefined

    inprogress = undefined
    parse_transaction = =>
      @domain ?= inprogress.request.headers.host
      @transactions.push(inprogress)
      inprogress = new Transaction(@, ab, ba, connection, parse_transaction)

    inprogress = new Transaction(@, ab, ba, connection, parse_transaction)


class Transaction
  next_id = 0

  parse_headers = (info) ->
    headers = info.headers
    info.headers = {}
    while headers.length isnt 0
      info.headers[headers.shift().toLowerCase()] = headers.shift()
    return info

  constructor: (@stream, ab, ba, connection, ready) ->
    @id = next_id
    next_id += 1

    req_parser = new HTTPParser(HTTPParser.REQUEST)
    res_parser = new HTTPParser(HTTPParser.RESPONSE)

    req_parser.onHeadersComplete = (info) =>
      return if @request?
      @request = parse_headers(info)
      @request_ack = @packets_in[@packets_in.length - 1]
    res_parser.onHeadersComplete = (info) =>
      @response = parse_headers(info)

    @packets = []
    @packets_in = []
    @packets_out = []
    connection.on 'data', (buffer, packet) =>
      packet.transaction = @
      @packets.push packet
      if packet.ipv4.src.toString() == connection.a.ip and packet.tcp.srcport == connection.a.port
        @packets_out.push packet
      else
        @packets_in.push packet
        @response_first_packet ?= packet if packet.tcp.payload.size > 0

    ab.on 'data', (dv, chunk) =>
      # @request_first_packet is not always contained in @packets_out and @packets, because it may be an ack to
      # a previous response, so it is in the packets array of that response! That's why @begin() works the way it does.
      @request_first_packet ?= chunk.parent.parent.parent.parent
      req_parser.execute new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), 0, dv.byteLength
    ba.on 'data', (dv) -> res_parser.execute new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), 0, dv.byteLength
    ab.on 'end', -> req_parser.finish()
    ba.on 'end', -> res_parser.finish()

    res_parser.onMessageComplete = =>
      stream.removeAllListeners('data') for stream in [connection, ab, ba]
      stream.removeAllListeners('end') for stream in [connection, ab, ba]
      ready()

  begin: (bandwidth) -> Math.min(@request_begin(bandwidth), packet_begin(@packets[0], bandwidth))
  end: -> packets[packets.length - 1].timestamp

  request_first: -> @request_first_packet
  request_last: -> @request_ack
  request_begin: (bandwidth) -> packet_begin @request_first(), bandwidth
  request_end: -> @request_last().timestamp
  request_duration: (bandwidth) -> @request_end() - @request_begin(bandwidth)

  response_first: -> @response_first_packet #@packets_in[@packets_in.indexOf(@request_ack) + 1]
  response_last: -> @packets_in[@packets_in.length - 1]
  response_begin: (bandwidth) -> packet_begin @response_first(), bandwidth
  response_end: -> @response_last().timestamp
  response_duration: (bandwidth) -> @response_end() - @response_begin(bandwidth)
