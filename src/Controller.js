$(function() {
  function notsupported() {
    alert('Sorry, this browser is not yet supported. Please come back with Chrome or Chromium.')
  }
  try {
    if (typeof Packet.views.PcapFile !== 'function') notsupported()
  } catch(e) {
    notsupported()
  }

  var barcode_svg = $('#barcode-container>svg')

  var width = $(document).width()
  barcode_svg.attr('width', width + 'px')

  var barcode = new Barcode(barcode_svg[0])
  var stacked = new StackedArea(barcode_svg[0])

  var capture, filtered_capture, palette, color_by = 'stream', bandwidth, duration

  function draw() {
    barcode.draw(filtered_capture, palette, bandwidth)
    stacked.draw(filtered_capture, palette, bandwidth, 125)
  }

  function filter(client, server) {
    if (client === 'any client') client = undefined
    if (server === 'any server') server = undefined
    filtered_capture = capture.filter(client, server)
    var kbit = filtered_capture.bandwidth()
    $('#bandwidth-input').val(Math.round(kbit))
    bandwidth = kbit * 1000 / 8
    duration = filtered_capture.duration(bandwidth)
    palette = new Palette(filtered_capture, color_by)
  }

  function options(dropdown, options) {
    dropdown.html(options.map(function(text) { return '<option>' + text + '</option>'}).join(''))
  }

  function load(pcap) {
    capture = new Capture(pcap)
    filter(undefined, undefined)
    draw()

    options($('#client-dropdown'), ['any client'].concat(capture.clients()))
    options($('#server-dropdown'), ['any server'].concat(capture.servers()))
    $('#time-input').val(Math.round(duration*10)/10)
    $('#width-input').val(Math.round(width))
    $('#width-s-input').val(Math.round(width / duration))
    $('#options-toggle').prop('disabled', false)
    $('#download-button').prop('disabled', false)
    $('#loading').hide()
  }

  $('#load-example').click(function() {
    $('#loading').show()
    setTimeout(function() {
      var xhr = new XMLHttpRequest()
      xhr.open('GET', 'example/example.pcap', true)
      xhr.responseType = 'arraybuffer'
      xhr.onload = function() { load(this.response) }
      xhr.send()
    }, 0)
    return false
  })

  $("#file-chooser").filestyle({
    buttonText: 'Choose PCAP file',
    icon: true,
    classIcon: 'icon-folder-open',
    textField: false
  }).change(function() {
      $('#loading').show()
      var file = this.files[0]
      var reader = new FileReader()
      reader.readAsArrayBuffer(file)
      reader.onload = function() { load(new DataView(reader.result)) }
    })

  var options_panel = $('#options'), options_toggle = $('#options-toggle')
  options_toggle.click(function() {
    options_toggle.parent().toggleClass('open')
    options_panel.toggle()
    return false
  })
  $('body').click(function(event) {
    if (options_panel.has(event.target).length === 0) {
      options_panel.hide()
      options_toggle.parent().removeClass('open')
    }
  })

  $('#download-button').click(function() {
    barcode.download('svg')
    return false
  })

  $('#color-dropdown').change(function() {
    color_by = this.selectedOptions[0].innerHTML
    palette = new Palette(filtered_capture, color_by)
    draw()
  })

  $('#bandwidth-input').change(function() {
    bandwidth = Number(this.value) * 1000 / 8
    draw()
  })

  $('#width-input').change(function() {
    barcode_svg.attr('width', this.value + 'px')
    $('#width-s-input').val(Math.round(this.value / duration))
  })

  $('#width-s-input').change(function() {
    $('#width-input').val(Math.round(this.value * duration)).change()
  })

  var clients_dropdown = document.getElementById('client-dropdown')
    , servers_dropdown = document.getElementById('server-dropdown')
  clients_dropdown.onchange = servers_dropdown.onchange = function filter_change() {
    var selected_client = clients_dropdown.selectedOptions[0].innerHTML
    var selected_server = servers_dropdown.selectedOptions[0].innerHTML
    filter(selected_client, selected_server)
    draw()
  }

  var time_info = $('#time-info')
  barcode.onmousemove = function(time) {
    time_info.text(Math.max(0, time).toFixed(2) + 's')
  }

  var hide_timeout, packet_info = $('#packet-info'), tcp_info = $('#tcp-info'), http_info = $('#http-info')
  barcode.onmouseover = function(stream, transaction, packet) {
    if (packet) {
      clearTimeout(hide_timeout)
      packet_info.text('packet #' + (packet.id + 1))
      tcp_info.text('TCP #' + stream.id)
      http_info.text('HTTP #' + transaction.id)

    } else if (stream) {
      clearTimeout(hide_timeout)
      tcp_info.text('TCP #' + stream.id)
      http_info.text('HTTP #' + transaction.id)
      hide_timeout = setTimeout(function() {
        packet_info.text('')
      }, 200)

    } else {
      hide_timeout = setTimeout(function() {
        packet_info.text('')
        tcp_info.text('')
        http_info.text('')
      }, 200)
    }
  }
})