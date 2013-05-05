$ ->
  # Helper functions
  timeout = (time, f) -> setTimeout(f, time)
  options = (dropdown, options) -> dropdown.html options.map((text) -> "<option>#{text}</option>").join('')

  # Testing if packet.js works properly
  notsupported = -> alert 'Error: could not initialize packet.js. Sorry for the inconvenience, please try with another browser.'
  try
    notsupported() if (typeof Packet.views.PcapFile isnt 'function')
  catch e
    notsupported()

  # The capture to visualise
  capture = undefined

  # View objects
  svg = $('#barcode-container>svg')
  barcode = window.barcode = new Barcode(svg[0])
  stacked = window.stacked = new StackedArea(svg[0])

  # Options
  client = undefined
  server = undefined
  bandwidth = undefined
  color_by = 'stream'
  svg.attr 'class', 'dark'
  width = $(document).width()
  svg.attr 'width', width + 'px'

  # Computed from capture and options
  filtered_capture = undefined
  duration = undefined
  palette = undefined

  draw = ->
    $('#intro').hide()
    $('#barcode-container').show()
    barcode.draw filtered_capture, palette, bandwidth
    stacked.draw filtered_capture, palette, bandwidth, 125

  prepare = ->
    window.filtered_capture = filtered_capture = capture.filter client, server
    kbit = filtered_capture.bandwidth()
    $('#bandwidth-input').val Math.round(kbit)
    bandwidth = kbit * 1000 / 8
    duration = filtered_capture.duration bandwidth
    palette = new Palette(filtered_capture, color_by)

  # Loading a pcap and initializing options panel with defaults values
  load = (pcap) ->
    capture = new Capture(pcap)
    prepare()
    draw()

    options $('#client-dropdown'), ['any client'].concat(capture.clients())
    options $('#server-dropdown'), ['any server'].concat(capture.servers())
    $('#time-input').val Math.round(duration*10)/10
    $('#width-input').val Math.round(width)
    $('#width-s-input').val Math.round(width / duration)
    $('#options-toggle').prop 'disabled', false
    $('#download-button').prop 'disabled', false
    $('#loading').hide()
    $('#hints').hide()

  # Load example file
  $('#load-example').click ->
    $('#loading').show()
    $(this).html('Please wait...').prop('disabled', true)
    timeout 0, -> window.load_example load
    return false

  # File open button handling
  $("#file-chooser").filestyle(
    buttonText: 'Choose PCAP file'
    icon: true
    classIcon: 'icon-folder-open'
    textField: false
  ).change ->
    $('#loading').show()
    file = @files[0]
    reader = new FileReader()
    reader.readAsArrayBuffer file
    reader.onload = -> load new DataView(reader.result)

  # Open options panel on clicking on wrench, and then close it when clicking outside the panel
  options_panel = $('#options')
  options_toggle = $('#options-toggle')
  options_toggle.click ->
    options_toggle.parent().toggleClass('open')
    options_panel.toggle()
    return false
  $('body').click (event) ->
    if (options_panel.has(event.target).length is 0)
      options_panel.hide()
      options_toggle.parent().removeClass('open')

  # Download as SVG button
  $('#download-button').click ->
    barcode.download('svg')
    return false

  # Color-by options handling
  $('#colorby-dropdown').change ->
    color_by = this.selectedOptions[0].innerHTML
    palette = new Palette(filtered_capture, color_by)
    draw()

  # Color theme options handling
  $('#colortheme-dropdown').change ->
    svg.attr 'class', this.selectedOptions[0].innerHTML

  $('#emphasize-dropdown').change ->
    svg.find('#packets').attr 'class', 'packets emphasize-' + this.selectedOptions[0].innerHTML

  # Bandwidth options handling
  $('#bandwidth-input').change ->
    bandwidth = Number(this.value) * 1000 / 8
    draw()

  # Width option handling
  $('#width-input').change ->
    $('#width-s-input').val Math.round(this.value / duration)
    svg.attr 'width', this.value + 'px'
  $('#width-s-input').change ->
    $('#width-input').val(Math.round(this.value * duration)).change()

  # Client and server filter options handling
  $('#client-dropdown')[0].onchange = $('#server-dropdown')[0].onchange = ->
    client = $('#client-dropdown')[0].selectedOptions[0].innerHTML
    server = $('#server-dropdown')[0].selectedOptions[0].innerHTML
    client = undefined if client is 'any client'
    server = undefined if server is 'any server'
    prepare()
    draw()

  # Display time, packet, tcp and http info
  hide_timeout = undefined
  barcode.onmouseover = (stream, transaction, packet) ->
    $('#tcp-info')   .text("TCP ##{stream.id}")        if stream
    $('#http-info')  .text("HTTP ##{transaction.id}")  if transaction
    $('#packet-info').text("packet ##{packet.id + 1}") if packet

    clearTimeout(hide_timeout) if stream or transaction or packet
    if (not stream or not transaction or not packet) then hide_timeout = timeout 200, ->
      $('#tcp-info')   .text('') if not stream
      $('#http-info')  .text('') if not transaction
      $('#packet-info').text('') if not packet

  barcode.onmousemove = (time) ->
    $('#time-info').text(Math.max(0, time).toFixed(2) + 's')
