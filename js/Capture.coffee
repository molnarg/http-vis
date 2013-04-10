Packet = window.Packet
HTTPParser = window.HTTPParser

packet_begin = (packet, bandwidth) -> packet.timestamp - packet.size / bandwidth

window.Capture = class Capture
  constructor: (pcap) ->
    @pcap = new Packet.views.PcapFile(pcap)
    @streams = []
    @transactions = []
    @packets = []

    begin = undefined
    tcp_tracker = Packet.stream.tcp()
    tcp_tracker.on 'connection', (ab, ba, connection) =>
      stream = new Stream(@, ab, ba, connection)
      stream.id = @streams.push(stream) - 1

    @pcap.packets.forEach (packet) =>
      packet.id = @packets.push(packet) - 1
      packet.timestamp = packet.ts_sec + packet.ts_usec / 1000000
      begin ?= packet.timestamp
      packet.relative_timestamp = packet.timestamp - begin
      tcp_tracker.write packet
    tcp_tracker.end()

  filter: (client, server) ->
    filtered = Object.create Capture.prototype
    filtered.pcap = @pcap
    filtered.streams = @streams.filter (stream) -> (not client or stream.src.ip is client) and (not server or stream.dst.address is server)
    filtered.transactions = @transactions.filter (transaction) -> transaction.stream in filtered.streams
    filtered.packets = @packets.filter (packet) -> packet.transaction in filtered.transactions

    return filtered

  clients: -> _.uniq (stream.src.ip for stream in @streams when stream.transactions.length isnt 0)
  servers: -> _.uniq (stream.dst.address for stream in @streams when stream.transactions.length isnt 0)

  packets_in: -> @packets.filter (packet) -> packet in packet.transaction.packets_in
  packets_out: -> @packets.filter (packet) -> packet in packet.transaction.packets_out

  begin: (bandwidth) -> packet_begin @packets[0], bandwidth
  end: -> @packets[@packets.length - 1].timestamp
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
    add = =>
      @domain ?= inprogress.request.headers.host
      @transactions.push(inprogress)
      inprogress.id = @capture.transactions.push(inprogress) - 1
    startnew = =>
      inprogress = new Transaction(@, ab, ba, connection, add, startnew)
    startnew()

class Transaction
  parse_headers = (info) ->
    headers = info.headers
    info.headers = {}
    while headers.length isnt 0
      info.headers[headers.shift().toLowerCase()] = headers.shift()
    return info

  register_packet: (connection, buffer, packet) ->
    packet.transaction = @
    @packets.push packet
    if packet.ipv4.src.toString() == connection.a.ip and packet.tcp.srcport == connection.a.port
      @packets_out.push packet
      if packet.tcp.payload.size > 0
        @request_first ?= packet
        @request_last = packet
    else
      @packets_in.push packet
      if packet.tcp.payload.size > 0
        @response_first ?= packet
        @response_last = packet

  constructor: (@stream, ab, ba, connection, onbegin, onend) ->
    @capture = @stream.capture

    req_parser = new HTTPParser(HTTPParser.REQUEST)
    res_parser = new HTTPParser(HTTPParser.RESPONSE)

    req_parser.onHeadersComplete = (info) =>
      return if @request?
      @request = parse_headers(info)
      onbegin()
    res_parser.onHeadersComplete = (info) =>
      @response = parse_headers(info)
      res_parser.onMessageComplete() if 'transfer-encoding' not of @response.headers and 'content-length' not of @response.headers

    @packets = []
    @packets_in = []
    @packets_out = []
    connection.on 'data', @register_packet.bind(@, connection)

    ab.on 'data', (dv) -> req_parser.execute new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), 0, dv.byteLength
    ba.on 'data', (dv) -> res_parser.execute new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), 0, dv.byteLength
    ab.on 'end', -> req_parser.finish()
    ba.on 'end', -> res_parser.finish()

    res_parser.onMessageComplete = =>
      stream.removeAllListeners('data') for stream in [connection, ab, ba]
      stream.removeAllListeners('end') for stream in [connection, ab, ba]
      connection.on 'data', (buffer, packet) =>
        if packet.tcp.payload.size is 0
          @register_packet connection, buffer, packet
        else
          connection.removeAllListeners(event) for event in ['data', 'end'] # don't listen anymore
          onend() # give the stream to the new owner
          connection.emit 'data', buffer, packet # re-emit event for the new owner
      connection.on 'end', ->
        connection.removeAllListeners(event) for event in ['data', 'end'] # don't listen anymore
        onend() # report that we are ready

  begin: (bandwidth) -> packet_begin(@packets[0], bandwidth)
  end: -> packets[packets.length - 1].timestamp

  request_begin: (bandwidth) -> packet_begin @request_first, bandwidth
  request_end: -> @request_last.timestamp
  request_duration: (bandwidth) -> @request_end() - @request_begin(bandwidth)

  response_begin: (bandwidth) -> packet_begin @response_first, bandwidth
  response_end: -> @response_last.timestamp
  response_duration: (bandwidth) -> @response_end() - @response_begin(bandwidth)
