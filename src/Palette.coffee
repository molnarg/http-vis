window.Palette = class Palette
  palette_size = 14
  monochrome_color = 0

  color: (transaction) ->
    if @method is 'monochrome' then monochrome_color else @transaction_colors[transaction.id] % palette_size

  constructor: (capture, @method) ->
    @transaction_colors = {}
    next_color = 0

    switch @method
      when 'stream'
        for transaction in capture.transactions
          @transaction_colors[transaction.id] = next_color++

      when 'domain'
        domain_colors = {}
        for stream in capture.streams
          domain_colors[stream.domain] ?= next_color++
          color = domain_colors[stream.domain]
          for transaction in stream.transactions
            @transaction_colors[transaction.id] = color

      when 'content-type'
        content_colors = {}
        for transaction in capture.transactions
          content_type = transaction.response?.headers['content-type']
          content_type = 'javascript' if content_type?.match /javascript/
          content_type = 'image' if content_type?.match /image/
          content_type = 'html' if content_type?.match /html/
          content_colors[content_type] ?= next_color++
          color = content_colors[content_type]
          @transaction_colors[transaction.id] = color


