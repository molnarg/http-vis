truncate = (maxlength, str) ->
  if str.length <= maxlength
    str
  else
    str.substr(0, maxlength - 1) + '...'

window.Stripes = class Stripes
  margin = 0.1

  constructor: (svg) ->
    @svg = d3.select(svg)

  download: (format) ->
    xml = @svg.node().parentNode.innerHTML.replace(/^\s*<!--\s*([\s\S]*)-->\s*<svg/, '$1\n<svg')
    blob = new Blob([xml], type: "image/svg+xml")

    if format is 'svg'
      saveAs(blob, "http-vis.svg")

    else if format is 'png'
      # There's bug holding it up in webkit:
      # https://bugs.webkit.org/show_bug.cgi?id=17352
      # http://code.google.com/p/chromium/issues/detail?id=58999
      img = new Image()
      img.onload = =>
        window.URL.revokeObjectURL(img.src)
        canvas = document.getElementById("canvas")
        canvas.width = @svg[0][0].clientWidth
        canvas.height = @svg[0][0].clientHeight
        ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0) # native -> security exception
        canvas.toBlob (blob) -> saveAs(blob, "http-vis") # canvas-toBlob
      img.src = window.URL.createObjectURL(blob)

    return false

  draw: (capture, palette, bandwidth) ->
    packets = capture.packets_in()

    # Placement
    duration = (packet) -> packet.size / bandwidth
    capture_begin = capture.begin(bandwidth)
    capture_duration = capture.duration(bandwidth)
    wireshark_begin = capture.packets[0].timestamp

    scale = d3.scale.linear()
      .domain([0, capture.end() - capture_begin])
      .range(['0%', '100%'])

    # Drawing packets
    draw_packets = (stripes, y, height) ->
      stripes.enter().append('rect')
        .attr('height', height)

      stripes
        .attr('packet-id', (packet) -> packet.id)
        .attr('x', (packet) -> scale(packet.timestamp - duration(packet) - capture_begin))
        .attr('y', y)
        .attr('width', (packet) -> scale(duration(packet)))
        .attr('fill', (packet) -> palette.color(packet.transaction))

      stripes.exit().remove()

    draw_packets @svg.select('#packets').selectAll('rect').data(packets), 0, '100%'

    # Drawing transactions
    transactions = capture.transactions.filter (t) -> (t.request and t.response) or console.error('incomplete transaction:', t)
    streams = capture.streams.filter (stream) -> stream.transactions.length isnt 0
    transaction_y = (transaction) -> 2*margin + (1 + 2*margin) * (streams.indexOf transaction.stream)

    bars = @svg.select('#transactions').selectAll('a').data(transactions)

    # Transactions enter
    as = bars.enter().append('a')
    as.append('title')
    as.append('rect')
      .attr('class', 'transaction-bar')
      .attr('height', '1em')
    as.append('rect')
      .attr('class', 'request')
      .attr('height', '1em')
    as.append('g')
      .attr('class', 'packets')

    # Transactions change
    bars
      .attr('transaction-id', (t) -> t.id)
      .attr('xlink:href', (t) -> t.request.url)
    bars.each((t) -> draw_packets d3.select(@).select('g.packets').selectAll('rect').data(t.packets_in), transaction_y(t) + 0.1 + 'em', '0.8em')
    bars.select('title').text (t) ->
      "TCP##{t.stream.id} (#{t.stream.domain})\n" +
      "HTTP##{t.id} (#{truncate 20, t.request.url.substr(t.request.url.lastIndexOf('/') + 1)})\n" +
      "begin: #{(t.request_begin(bandwidth) - wireshark_begin).toFixed(2)}s\n" +
      "sending: #{Math.round t.request_duration(bandwidth) * 1000}ms\n" +
      "waiting: #{Math.round (t.response_begin(bandwidth) - t.request_end()) * 1000}ms\n" +
      "receiving: #{Math.round t.response_duration(bandwidth) * 1000}ms"
    bars.select('rect.transaction-bar')
      .attr('x',     (t) -> scale(t.begin(bandwidth) - capture_begin))
      .attr('y',     (t) -> transaction_y(t) + 'em')
      .attr('width', (t) -> scale(t.response_end() - t.begin(bandwidth)))
    bars.select('rect.request')
      .attr('x',     (t) -> scale(t.request_begin(bandwidth) - capture_begin))
      .attr('y',     (t) -> transaction_y(t) + 'em')
      .attr('width', (t) -> scale(t.response_begin(bandwidth) - t.request_begin(bandwidth)))

    # Transactions exit
    bars.exit()
      .remove()

    # SVG size
    em = Number(getComputedStyle(bars[0][0], "").fontSize.match(/(\d*(\.\d*)?)px/)[1])
    @svg.attr('height', (2*margin + streams.length * (1 + 2*margin)) * em + 105 + 'px')

    # Events
    svg_dom = @svg[0][0]
    @svg.on 'mousemove', =>
      event = d3.event
      time = capture_begin + capture_duration * (event.clientX - svg_dom.offsetLeft) / svg_dom.clientWidth - wireshark_begin
      @onmousemove time
    @svg.on 'mouseover', =>
      event = d3.event
      if event.target.classList.toString() == 'packet'
        packet = capture.capture.packets[event.target.getAttribute('packet-id')]
        transaction = packet.transaction
        stream = transaction.stream
        @onmouseover(stream, transaction, packet)

      else if event.target.parentNode.classList.toString() == 'transaction'
        transaction = capture.capture.transactions[event.target.parentNode.getAttribute('transaction-id')]
        stream = transaction.stream
        @onmouseover(stream, transaction)

      else
        @onmouseover()

  onmousemove: (time) ->
  onmouseover: (stream, transaction, packet) ->
