window.Histogram = class Histogram
  constructor: (svg) ->
    @svg = d3.select(svg)

  draw: (capture, palette, interval) ->
    begin = capture.first_packet().timestamp
    end = capture.last_packet().timestamp
    duration = end - begin
    intervals = Math.floor(duration / interval)

    data = d3.layout.stack() capture.transactions().map (transaction) ->
      traffic = ({x, y:0} for x in [0..intervals])
      transaction.packets_in.forEach (packet) -> traffic[Math.floor((packet.timestamp - begin) / interval)].y += packet.size
      traffic.transaction = transaction
      return traffic

    scale_x = d3.scale.linear().range([0, 100]).domain([0, intervals])
    scale_y = d3.scale.linear().range([0, 90]).domain([0, d3.max(data[data.length - 1], (d) -> d.y0 + d.y)])

    stream = @svg.selectAll("g.stream")
        .data(data)
      .enter().append("svg:g")
        .attr("class", "stream")
        .style("fill", (d, i) -> palette.color(d.transaction))

    rect = stream.selectAll("rect")
        .data(Object)
      .enter().append("svg:rect")
        .attr("x", (d) -> scale_x(d.x) + '%')
        .attr("y", (d) -> 100 - scale_y(d.y0 + d.y) + '%')
        .attr("height", (d) -> scale_y(d.y) + '%')
        .attr("width", 100 / intervals + '%')
