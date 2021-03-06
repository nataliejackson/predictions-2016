function formatHumanNumber(n) {
  return n.toFixed(0)
        .replace(/(\d)(?=(\d{3})+$)/g, '$1,');
}

function handle_hover_on_vote_counts() {
  var bars_el = document.querySelector('#president-vote-counts .bars');
  if (!bars_el) return;
  var bars = bars_el.childNodes;
  var tooltip = document.querySelector('#president-vote-counts .tooltip');
  var tooltipParts = {
    nClinton: tooltip.querySelector('.clinton strong'),
    nTrump: tooltip.querySelector('.trump strong'),
    n: tooltip.querySelector('p strong'),
    timeOrTimes: tooltip.querySelector('p span')
  };

  function findBarAtX(x) {
    var min = 0;
    var max = bars.length;

    while (min < max) {
      var mid = (min + max) >> 1; // min <= mid < max
      var bar = bars[mid];
      var bar_x1 = bar.offsetLeft;
      var bar_x2 = bar_x1 + bar.offsetWidth;

      if (bar_x1 <= x && bar_x2 >= x) {
        return bar;
      } else if (bar_x2 < x) {
        min = mid + 1;
      } else {
        max = mid;
      }
    }

    return bars[bars.length - 1];
  }

  function findMedianBar() {
    var runningTotal = 0;
    var runningTotals = new Array(bars.length);

    for (var i = 0; i < bars.length; i++) {
      var n = +bars[i].getAttribute('data-n');
      runningTotal += n;
      runningTotals[i] = runningTotal;
    }

    var median = runningTotal / 2;

    for (var i = 0; i < runningTotals.length; i++) {
      if (runningTotals[i] >= median) {
        return bars[i];
      }
    }

    return bars[0];
  }

  var defaultBar = findMedianBar();
  var focalBar = defaultBar;
  focalBar.classList.add('focus');

  function repositionTooltip() {
    tooltip.className = 'tooltip';
    tooltip.style.left = focalBar.offsetLeft + focalBar.clientWidth / 2 + 'px';

    if (tooltip.offsetLeft < 0) {
      tooltip.style.left = '0';
      tooltip.className = 'tooltip flush-left';
    } else if (tooltip.offsetLeft + tooltip.offsetWidth > bars_el.clientWidth) {
      tooltip.style.left = '';
      tooltip.className = 'tooltip flush-right';
    }
  }

  function focusBar(bar) {
    focalBar.classList.remove('focus');
    focalBar = bar;
    focalBar.classList.add('focus');

    var n = +bar.getAttribute('data-n');
    var count = +bar.getAttribute('data-count');

    tooltipParts.nClinton.textContent = String(count);
    tooltipParts.nTrump.textContent = String(538 - count);
    tooltipParts.n.textContent = formatHumanNumber(n);
    tooltipParts.timeOrTimes.textContent = (n === 1 ? 'time' : 'times');

    repositionTooltip();
  }

  function focus(ev) {
    var bar = findBarAtX(ev.clientX - bars_el.parentNode.offsetLeft);
    focusBar(bar);
  }

  function leave() {
    focusBar(defaultBar);
  }

  focusBar(defaultBar);
  bars_el.addEventListener('mousemove', focus);
  bars_el.addEventListener('mouseleave', leave);
}

/**
 * Create sparklines out of win probabilities.
 */
function make_win_probabilities_histograms() {
  var mainContainer = document.getElementById('president-races');
  if (!mainContainer) return;

  var histograms = []; // { canvas, container, min, max, buckets, mean, stddev }
  function collectHistograms(html_class, min, max) {
    var canvases = mainContainer.querySelectorAll('ul.races.' + html_class + ' canvas, .key.' + html_class + ' canvas');
    for (var i = 0; i < canvases.length; i++) {
      var canvas = canvases[i];
      var container = canvas.parentNode;
      var mean = +container.getAttribute('data-xibar');
      var stddev = +container.getAttribute('data-stddev');
      histograms.push({
        canvas: canvas,
        container: container,
        min: min,
        max: max,
        mean: mean,
        stddev: stddev
      });
    }
  }
  collectHistograms('likely-clinton', -0, 40);
  collectHistograms('battlegrounds', 20, -20);
  collectHistograms('likely-trump', 0, -40);

  function normalCdf(x) {
    // http://papers.ssrn.com/sol3/papers.cfm?abstract_id=2579686
    var sign = x > 0 ? 1 : -1;
    return 0.5 * (1 + sign * Math.sqrt((1 - Math.exp(-2 / Math.PI * x * x))));
  }

  function barFraction(bucketMin, bucketMax, mean, stddev) {
    var cd1 = normalCdf((bucketMax - mean) / stddev);
    var cd2 = normalCdf((bucketMin - mean) / stddev);
    return Math.abs(cd2 - cd1);
  }

  function refresh() {
    // Pick a sample container. Pick the _second_ one: the first is a legend.
    // The second (and most others) are contrained by their containers.
    var aContainer = histograms[1].container;

    var containerStyle = window.getComputedStyle(aContainer);
    var width = aContainer.clientWidth;
    var height = aContainer.clientHeight - parseFloat(containerStyle.paddingTop) - parseFloat(containerStyle.paddingBottom);

    var bucketWidth = 5;
    var nBuckets = Math.floor((width + 1) / bucketWidth);
    // We want an odd number of buckets, so the mean is highest
    if (nBuckets % 2 === 0) nBuckets -= 1;
    var maxFraction = 0;
    var strongDem = '#4c7de0';
    var strongGop = '#e52426';
    var mutedDem = '#afbaf9';
    var mutedGop = '#f19192';
    var tossUp = '#999';

    function color(barMin, barMax, mean, stddev) {
      if ((barMin <= 0) === (barMax >= -0)) return tossUp;
      if (barMax >= -0) {
        if ((barMin <= mean) === (barMax >= mean)) return strongDem;
        return mutedDem;
      } else {
        if ((barMin <= mean) === (barMax >= mean)) return strongGop;
        return mutedGop;
      }
    }

    histograms.forEach(function(histogram) {
      var bucketSize = (histogram.max - histogram.min) / nBuckets;
      var buckets = histogram.buckets = [];
      for (var i = 0; i < nBuckets; i++) {
        var min = histogram.min + bucketSize * i;
        var max = histogram.min + bucketSize * (i + 1);
        var fraction = barFraction(min, max, histogram.mean, histogram.stddev);

        buckets.push({
          color: color(min, max, histogram.mean, histogram.stddev),
          fraction: fraction
        });

        if (fraction > maxFraction) maxFraction = fraction;
      }
    });

    // x0: left of first rect. Each bucket is 5px wide, with the rect in the
    // rightmost 4px. The first bucket is only 4px wide, so the rect is flush
    // to the edge in that one case.
    var x0 = Math.floor((width - (bucketWidth * nBuckets - 1)) / 2);

    histograms.forEach(function(histogram) {
      var canvas = histogram.canvas;
      canvas.width = width;
      canvas.height = height;

      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      histogram.buckets.forEach(function(bucket, i) {
        var x = x0 + 5 * i;
        var h = height * bucket.fraction / maxFraction;

        ctx.fillStyle = bucket.color;
        ctx.fillRect(x, height - h, 4, h);
      });
    });
  }

  var deferredRefresh = null; // Timeout
  function deferRefresh() {
    if (deferredRefresh !== null) return;
    deferredRefresh = window.setTimeout(function() {
      refresh();
      deferredRefresh = null;
    }, 250);
  }

  refresh();
  window.addEventListener('resize', deferRefresh);
}

document.addEventListener('DOMContentLoaded', function() {
  handle_hover_on_vote_counts();
  make_win_probabilities_histograms();
});
