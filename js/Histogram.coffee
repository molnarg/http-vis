window.Histogram = class Histogram
  no_slices = 10

  constructor: (@container, @capture) ->
    @paper = new Raphael(@container, @container.clientWidth, @container.clientHeight)
    #@paper.circle(100, 100, 100)
    window.x = @paper.barchart(0,0,400,100, [[1,2,3,4,6],[1,2,3],[1,2,3],[2],[3],[4]], {stacked: true})

    #slice_length = @capture.length / no_slices
    #@slices = new Slice(@, @capture, n * slice_length, slice_length) for n in [0..no_slices-1]

class Slice
  constructor: (@histogram, @capture, @begin, @length) ->
