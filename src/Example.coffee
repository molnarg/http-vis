load_hints = ->
  template = '<a class="next-hint" href="#" onclick="next_popover(#id#); return false;">Next</a>'
  hint_buttons = $('#hints>i')

  # Initializing hints for the info icons
  hint_buttons.each (id) ->
    icon = $(@)
    if id is hint_buttons.length - 1 then template = template.replace('Next', 'Close')
    icon.popover
      html: true
      content: icon.attr('data-content') + template.replace('#id#', id)
      placement: icon.attr('data-placement') || 'right'
      animation: false
    if icon.css('position') is 'fixed'
      icon.click -> icon.siblings('.popover').css({ 'position': 'fixed', 'z-index': 10000 })

  # When opening a hint, close all other hints
  hint_buttons.click -> $(this).siblings('i').popover('hide')

  # Handling the next/close button
  window.next_popover = (id) ->
    hint_buttons.popover('hide')
    setTimeout (-> $(hint_buttons[id + 1]).click()), 50

  # Close every hint if clicking outside of hints
  $('body').click (event) ->
    if $('#hints').has(event.target).length is 0 and not $(event.target).parents().hasClass('popover')
      $('#hints>*').popover('hide')

  # Show the hint icons and open the first
  $('#hints').show()
  $('#hints>*').first().popover('show')

  # Preload images needed for other hints:
  preload = new Image()
  preload.src = "img/legend-request.svg"

window.load_example = (load_pcap) ->
  xhr = new XMLHttpRequest()
  xhr.open 'GET', 'example/example.pcap', true
  xhr.responseType = 'arraybuffer'
  xhr.onload = ->
    load_pcap @response
    load_hints()
  xhr.send()
