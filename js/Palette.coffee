window.Palette = class Palette
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
  ]
  palette = palette.map (color) -> d3.hsl(color[0], color[1]/100, color[2]/100)

  monochrome_color = d3.hsl(0, 0, 0.2)

  next_color: ->
    @color_id += 1
    return palette[(@color_id - 1) % palette.length]

  color: (transaction) ->
    if @method is 'monochrome' then monochrome_color else @transaction_colors[transaction.id]

  constructor: (capture, @method) ->
    @transaction_colors = {}
    @color_id = 0

    switch @method
      when 'stream'
        for stream in capture.streams
          color = @next_color()
          for transaction in stream.transactions
            @transaction_colors[transaction.id] = color

      when 'domain'
        domain_colors = {}
        for stream in capture.streams
          domain_colors[stream.domain] ?= @next_color()
          color = domain_colors[stream.domain]
          for transaction in stream.transactions
            @transaction_colors[transaction.id] = color

      when 'content-type'
        content_colors = {}
        for stream in capture.streams
          for transaction in stream.transactions
            content_type = transaction.response.headers['content-type']
            content_type = 'javascript' if content_type?.match /javascript/
            content_type = 'image' if content_type?.match /image/
            content_type = 'html' if content_type?.match /html/
            content_colors[content_type] ?= @next_color()
            color = content_colors[content_type]
            @transaction_colors[transaction.id] = color


