// Generated by CoffeeScript 1.6.1
(function() {
  var Histogram, Slice;

  window.Histogram = Histogram = (function() {
    var no_slices;

    no_slices = 10;

    function Histogram(container, capture) {
      this.container = container;
      this.capture = capture;
      this.paper = new Raphael(this.container, this.container.clientWidth, this.container.clientHeight);
      window.x = this.paper.barchart(0, 0, 400, 100, [[1, 2, 3, 4, 6], [1, 2, 3], [1, 2, 3], [2], [3], [4]], {
        stacked: true
      });
    }

    return Histogram;

  })();

  Slice = (function() {

    function Slice(histogram, capture, begin, length) {
      this.histogram = histogram;
      this.capture = capture;
      this.begin = begin;
      this.length = length;
    }

    return Slice;

  })();

}).call(this);
