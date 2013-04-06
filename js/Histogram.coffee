window.Histogram = class Histogram
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

  constructor: (svg) ->
    @svg = d3.select(svg)

  draw: (capture, interval) ->
    begin = capture.first_packet().timestamp
    end = capture.last_packet().timestamp
    duration = end - begin
    intervals = Math.floor(duration / interval)

    data = d3.layout.stack() capture.transactions().map (transaction) ->
      traffic = ({x, y:0} for x in [0..intervals])
      transaction.packets_in.forEach (packet) -> traffic[Math.floor((packet.timestamp - begin) / interval)].y += packet.size
      return traffic

    scale_x = d3.scale.linear().range([0, 100]).domain([0, intervals])
    scale_y = d3.scale.linear().range([0, 90]).domain([0, d3.max(data[data.length - 1], (d) -> d.y0 + d.y)])

    stream = @svg.selectAll("g.stream")
        .data(data)
      .enter().append("svg:g")
        .attr("class", "stream")
        .style("fill", (d, i) -> palette[i % palette.length])

    rect = stream.selectAll("rect")
        .data(Object)
      .enter().append("svg:rect")
        .attr("x", (d) -> scale_x(d.x) + '%')
        .attr("y", (d) -> 100 - scale_y(d.y0 + d.y) + '%')
        .attr("height", (d) -> scale_y(d.y) + '%')
        .attr("width", 100 / intervals + '%')
