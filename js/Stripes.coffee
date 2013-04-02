window.Stripes = class Stripes
  palette = [
    [202, 100, 41]
    [209, 100, 26]
    [13, 100, 53]
    [48, 100, 56]
    [93, 70, 36]
    [344, 100, 25]
    [206, 100, 76]
    [75, 88, 13]
    [70, 100, 41]
    [273, 56, 28]
    [34, 100, 53]
    [357, 100, 39]
    [337, 92, 46]
    [141, 95, 46]
    [357, 0, 60]
    [357, 0, 15]
  ]
  palette = palette.map (color) -> d3.hsl(color[0], color[1]/100, color[2]/100).toString()

  margin = 0.1

  constructor: (svg) ->
    @svg = d3.select(svg)
    #@svg = d3.select(@container).append('svg')
    #    .attr('width', '100%')
    #    .attr('style', 'shape-rendering: crispEdges; font-size: 1.5em;')

    #@svg.append('script').text('function packet_info(stripe) { console.log(stripe) }')

  download: ->
    xml = @svg.node().parentNode.innerHTML.replace(/^\s*<!--\s*([\s\S]*)-->\s*<svg/, '$1\n<svg')
    document.location.href = 'data:application/octet-stream;base64,' + btoa(xml)
    return false

  draw: (capture, bandwidth, color_by) ->
    packets = capture.packets_in()

    # Placement
    duration = (packet) -> packet.size / bandwidth
    capture_begin = capture.first_packet.timestamp - duration(capture.first_packet)
    capture_end = capture.last_packet.timestamp

    scale = d3.scale.linear()
      .domain([0, capture_end - capture_begin])
      .range(['0%', '100%'])

    # Color
    transaction_colors = {}
    color_id = 0
    next_color = ->
      color_id += 1
      return palette[(color_id - 1) % palette.length]
    switch color_by
      when 'stream'
        for stream in capture.streams
          color = next_color()
          for transaction in stream.transactions
            transaction_colors[transaction.id] = color

      when 'domain'
        domain_colors = {}
        for stream in capture.streams
          domain_colors[stream.domain] ?= next_color()
          color = domain_colors[stream.domain]
          for transaction in stream.transactions
            transaction_colors[transaction.id] = color

      when 'content-type'
        content_colors = {}
        for stream in capture.streams
          for transaction in stream.transactions
            content_type = transaction.response.headers['content-type']
            content_type = 'javascript' if content_type?.match /javascript/
            content_type = 'image' if content_type?.match /image/
            content_type = 'html' if content_type?.match /html/
            content_colors[content_type] ?= next_color()
            color = content_colors[content_type]
            transaction_colors[transaction.id] = color

    color = (packet) -> transaction_colors[packet.transaction.id]

    # Drawing packets
    draw_packets = (stripes, y, height) ->
      stripes.enter().append('rect')
        .attr('class', 'packet')
        .attr('y', y)
        .attr('height', height)
        .attr('packet-id', (packet) -> packet.id)
        #.attr('onmouseover', 'packet_info(this)')
        #.attr('title', (packet) -> packet.id)

      stripes
        .attr('x', (packet) -> scale(packet.timestamp - duration(packet) - capture_begin))
        .attr('width', (packet) -> scale(duration(packet)))
        .attr('fill', color)

      stripes.exit().remove()

    draw_packets @svg.selectAll('rect.packet').data(packets), 0, '100%'

    # Drawing transactions
    transactions = capture.transactions()
    streams = []
    tps = transactions.map (transaction) ->
      first_packet = transaction.packets[0]
      last_packet = transaction.packets[transaction.packets.length - 1]
      streams.push transaction.stream if transaction.stream not in streams

      transaction_begin = first_packet.timestamp - duration(first_packet)
      x = transaction_begin - capture_begin
      width = last_packet.timestamp - transaction_begin
      y = 2*margin + (1 + 2*margin) * (streams.indexOf transaction.stream)

      return { x, width, y }

    bars = @svg.selectAll('a.transaction').data(transactions)

    bars.enter()
      .append('a')
        .attr('class', 'transaction')
        .attr('id', (t, id) -> 'transaction-' + id)
        .attr('xlink:href', (t, id) -> t.request.url)
        .append('rect')
          .attr('class', 'stream')
          .attr('height', '1em')

    bars
      .each((t, id) -> draw_packets d3.select(@).selectAll('rect.packet').data(t.packets_in), tps[id].y + 0.1 + 'em', '0.8em')
      .select('rect')
        .attr('x',     (t, id) -> scale(tps[id].x))
        .attr('y',     (t, id) -> tps[id].y + 'em')
        .attr('width', (t, id) -> scale(tps[id].width))

    bars.exit().remove()

    em = Number(getComputedStyle(bars[0][0], "").fontSize.match(/(\d*(\.\d*)?)px/)[1])
    @svg.attr('height', (2*margin + streams.length * (1 + 2*margin)) * em + 'px')
