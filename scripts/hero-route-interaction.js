/* ============================================================
   HERO ROUTE INTERACTION
   Small, self-contained enhancement for the existing hero emblem
   (the route-network SVG already in index.html). Adds three
   interactive waypoints along the existing spoke paths, each with
   a short label, plus a tiny marker that travels along the real
   path geometry that's already defined in the SVG.

   - Reads CONFIG.routes (defined in shared.js) when it becomes
     available, purely to display real route city names — it
     never defines, duplicates, or mutates route data.
   - Does not touch booking, tracking, admin, or Supabase logic.
   - Runs entirely independently of initApp() in script.js.
   ============================================================ */
(function(){
  var root = document.getElementById('hero-route-interaction');
  if(!root) return;

  var svg = root.parentElement ? root.parentElement.querySelector('svg') : null;
  var paths = svg ? svg.querySelectorAll('.emblem-path') : [];
  var vehicle = document.getElementById('hero-vehicle');
  var waypoints = Array.prototype.slice.call(root.querySelectorAll('.hero-waypoint'));
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none)').matches;

  var activeWp = null;
  var lastWp = null;
  var rafId = null;

  /* ---- Waypoint 1: fill in real route cities once CONFIG loads ---- */
  function fillRouteText(){
    var el = root.querySelector('[data-wp-dynamic="routes"]');
    if(!el) return true;
    if(typeof CONFIG !== 'undefined' && CONFIG && Array.isArray(CONFIG.routes) && CONFIG.routes.length){
      var cities = CONFIG.routes
        .filter(function(r){ return r.active !== false; })
        .map(function(r){ return r.city; });
      if(cities.length){
        el.textContent = 'Choose from ' + cities.join(', ') + '.';
        return true;
      }
    }
    return false;
  }
  if(!fillRouteText()){
    var tries = 0;
    var poll = setInterval(function(){
      tries++;
      if(fillRouteText() || tries > 20) clearInterval(poll);
    }, 300);
  }

  /* ---- Vehicle marker: travels along the real spoke path ---- */
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  function moveVehicle(wp, toward){
    if(!vehicle || !svg || reduceMotion) return;
    var pathIndex = wp ? parseInt(wp.getAttribute('data-path-index'), 10) : null;
    var path = (pathIndex !== null && !isNaN(pathIndex) && paths[pathIndex]) ? paths[pathIndex] : null;
    if(!path){
      vehicle.classList.add('is-idle');
      return;
    }
    vehicle.classList.remove('is-idle');
    var total = path.getTotalLength();
    var from = toward ? 0 : 1;
    var to = toward ? 1 : 0;
    var duration = 550;
    var start = performance.now();
    if(rafId) cancelAnimationFrame(rafId);

    function frame(now){
      var t = Math.min(1, (now - start) / duration);
      var eased = easeOutCubic(t);
      var progress = from + (to - from) * eased;
      var pt = path.getPointAtLength(progress * total);
      vehicle.style.left = (pt.x / 320 * 100) + '%';
      vehicle.style.top = (pt.y / 320 * 100) + '%';
      vehicle.style.opacity = '1';
      if(t < 1){
        rafId = requestAnimationFrame(frame);
      } else if(!toward){
        vehicle.classList.add('is-idle');
        vehicle.style.left = '';
        vehicle.style.top = '';
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  /* ---- Waypoint activation ---- */
  function setActive(wp){
    if(activeWp === wp) return;
    if(activeWp) activeWp.classList.remove('is-active');
    if(wp) lastWp = wp;
    activeWp = wp;
    if(wp){
      wp.classList.add('is-active');
      moveVehicle(wp, true);
    } else {
      moveVehicle(lastWp, false);
    }
  }

  waypoints.forEach(function(wp){
    if(!isTouch){
      wp.addEventListener('pointerenter', function(){ setActive(wp); });
      wp.addEventListener('pointerleave', function(){ setActive(null); });
      wp.addEventListener('focus', function(){ setActive(wp); });
      wp.addEventListener('blur', function(){ setActive(null); });
    } else {
      wp.addEventListener('click', function(e){
        e.preventDefault();
        setActive(activeWp === wp ? null : wp);
      });
    }
  });

  /* Tapping outside an open waypoint closes it (touch only). */
  if(isTouch){
    document.addEventListener('click', function(e){
      if(activeWp && !root.contains(e.target)){ setActive(null); }
    });
  }
})();
