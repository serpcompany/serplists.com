// The Google Tag Manager bootstrap, rendered into every page's <head> by the root layout.
// Tags in the container read location.href at load (GA4 sends it as page_location), so a
// document whose URL carries a share or invite token, a reset token or an email address
// never loads it, nor one whose `next` return path points at such a page. Keep in step with
// src/lib/analyticsUrl.ts (tests/unit/security/gtmBootstrap.test.ts).
export const TAG_MANAGER_ID = 'GTM-PZZFQBGG';

export const TAG_MANAGER_BOOTSTRAP_SCRIPT = `(function (win, doc) {
  // Tags in the container read location.href, so a document whose URL carries a
  // share or invite token, a reset token or an email address never loads it, nor
  // one whose \`next\` return path points at such a page. Keep in step with
  // src/lib/analyticsUrl.ts (tests/unit/security/gtmBootstrap.test.ts).
  function isSensitiveLocation(pathname, search) {
    var path = pathname;
    try {
      path = decodeURIComponent(pathname);
    } catch (_error) {
      path = pathname;
    }
    path = path.replace(/^\\/+/, '/');
    if (/^\\/(share|team-invites|reset-password)(\\/|$)/i.test(path)) return true;
    var sensitiveKeys = ['token', 'email', 'code', 'state'];
    var sensitive = false;
    new URLSearchParams(search).forEach(function (value, key) {
      var name = key.toLowerCase();
      if (sensitiveKeys.indexOf(name) !== -1) sensitive = true;
      if (name === 'next' && isSensitiveReturnPath(value)) sensitive = true;
    });
    return sensitive;
  }

  function isSensitiveReturnPath(value) {
    var withoutHash = value.split('#')[0];
    var queryStart = withoutHash.indexOf('?');
    return queryStart === -1
      ? isSensitiveLocation(withoutHash, '')
      : isSensitiveLocation(withoutHash.slice(0, queryStart), withoutHash.slice(queryStart));
  }

  var skipTagManager = true;
  try {
    skipTagManager = isSensitiveLocation(win.location.pathname, win.location.search);
  } catch (_error) {
    skipTagManager = true;
  }
  if (skipTagManager) return;

  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(win,doc,'script','dataLayer','GTM-PZZFQBGG');
})(window, document);`;
