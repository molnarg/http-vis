window.Histogram = class Histogram
  constructor: (svg) ->
    @svg = d3.select(svg)

  draw: (capture, palette, interval) ->
    begin = capture.first_packet().timestamp
    end = capture.last_packet().timestamp
    duration = end - begin
    intervals = Math.floor(duration / interval)

    transactions = _.sortBy capture.transactions(), (transaction) -> palette.color(transaction).toString()

    data = d3.layout.stack() transactions.map (transaction) ->
      traffic = ({x, y:0} for x in [0..intervals])
      transaction.packets_in.forEach (packet) -> traffic[Math.floor((packet.timestamp - begin) / interval)].y += packet.size
      traffic.transaction = transaction
      return traffic

    scale_x = d3.scale.linear().range([0, 100]).domain([0, intervals])
    scale_y = d3.scale.linear().range([0, 90]).domain([0, d3.max(data[data.length - 1], (d) -> d.y0 + d.y)])

    stream = @svg.selectAll("g.stream").data(data)
    stream.enter().append("svg:g")
      .attr("class", "stream")
    stream
      .style("fill", (d) -> palette.color(d.transaction))

    rect = stream.selectAll("rect.area").data(Object)
    rect.enter().append("svg:rect")
      .attr("class", "area")
      .attr("x", (d) -> scale_x(d.x) + '%')
      .attr("width", 100 / intervals + '%')
    rect
      .attr("y", (d) -> 100 - scale_y(d.y0 + d.y) + '%')
      .attr("height", (d) -> scale_y(d.y) + '%')
