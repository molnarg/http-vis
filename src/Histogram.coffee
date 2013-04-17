window.Histogram = class Histogram
  constructor: (svg) ->
    @svg = d3.select(svg)

  draw: (capture, palette, bandwidth, intervals) ->
    begin = capture.begin(bandwidth)
    end = capture.end()
    duration = end - begin
    interval = duration / intervals

    transactions = _.sortBy capture.transactions, (transaction) -> palette.color(transaction).toString()

    data = d3.layout.stack() transactions.map (transaction) ->
      for i in [0..intervals]
        interval_begin = i * interval
        interval_end = interval_begin + interval
        interval_data = 0

        for packet in transaction.packets_in
          packet_duration = packet.ethernet.byteLength / bandwidth
          packet_end = packet.timestamp - begin
          packet_begin = packet_end - packet_duration
          continue if packet_end < interval_begin or packet_begin > interval_end
          packet_interval_duration = Math.min(packet_end, interval_end) - Math.max(packet_begin, interval_begin)
          interval_data += packet.ethernet.byteLength * packet_interval_duration / packet_duration

        {x: i, y: interval_data}

    scale_x = d3.scale.linear().range([0, 100]).domain([0, intervals])
    scale_y = d3.scale.linear().range([0, 90]).domain([0, d3.max(data[data.length - 1], (d) -> d.y0 + d.y)])

    stream = @svg.select('#histogram').selectAll("g.stream").data(data)
    stream.enter().append("svg:g")
      .attr("class", "stream")
    stream
      .style("fill", (d, i) -> palette.color(transactions[i]))
    stream.exit().remove()

    rect = stream.selectAll("rect.area").data(Object)
    rect.enter().append("svg:rect")
      .attr("class", "area")
      .attr("x", (d) -> scale_x(d.x) + '%')
      .attr("width", 100 / intervals + '%')
    rect
      .attr("y", (d) -> 100 - scale_y(d.y0 + d.y) + '%')
      .attr("height", (d) -> scale_y(d.y) + '%')
