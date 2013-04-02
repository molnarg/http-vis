Packet = window.Packet
HTTPParser = window.HTTPParser

packet_begin = (packet, bandwidth) -> packet.timestamp - packet.size / bandwidth

window.Capture = class Capture
  constructor: (pcap) ->
    @pcap = new Packet.views.PcapFile(pcap)
    @streams = []
    @first_packet = undefined
    @last_packet = undefined

    tcp_tracker = Packet.stream.tcp()
    tcp_tracker.on 'connection', (ab, ba, connection) => @streams.push new Stream(@, ab, ba, connection)
    @pcap.packets.forEach (packet, id) =>
      packet.id = id
      packet.timestamp = packet.ts_sec + packet.ts_usec / 1000000
      tcp_tracker.write packet
      @first_packet ?= packet
      @last_packet = packet

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
    filtered.first_packet = @first_packet # TODO
    filtered.last_packet = @last_packet # TODO
    return filtered

  packets_in: ->
    packets = _.flatten(transaction.packets_in for transaction in stream.transactions for stream in @streams)
    return _.sortBy packets, (packet) -> packet.timestamp

  bandwidth: ->
    packets = @packets_in()
    window_size = 0.4
    window_begin = 0
    window_bytes = 0
    max_bandwidth = 0

    for window_end in [0..packets.length - 1]
      window_bytes += packets[window_end].size

      while window_size < packets[window_end].timestamp - packets[window_begin].timestamp
        window_bytes -= packets[window_begin].size
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
      @request = parse_headers(info)
      @request_ack = @packets[@packets.length - 1]
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
        @request_first_data ?= packet if packet.tcp.payload.size > 0
      else
        @packets_in.push packet

    ab.on 'data', (dv) =>
      #@request_first_data ?= @packets_out[@packets_out.length - 1]
      req_parser.execute new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), 0, dv.byteLength
    ba.on 'data', (dv) -> res_parser.execute new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), 0, dv.byteLength

    res_parser.onMessageComplete = =>
      stream.removeAllListeners('data') for stream in [connection, ab, ba]
      ready()

  request_first: -> @request_first_data or @packets_out[0]
  request_last: -> @request_ack
  request_begin: (bandwidth) -> packet_begin @request_first(), bandwidth
  request_end: -> @request_last().timestamp
  request_duration: (bandwidth) -> @request_end() - @request_begin(bandwidth)

  response_first: -> @packets_in[@packets_in.indexOf(@request_ack) + 1]
  response_last: -> @packets_in[@packets_in.length - 1]
  response_begin: (bandwidth) -> packet_begin @response_first(), bandwidth
  response_end: -> @response_last().timestamp
  response_duration: (bandwidth) -> @response_end() - @response_begin(bandwidth)

