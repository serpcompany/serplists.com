export const TAG_MANAGER_ID = 'GTM-PZZFQBGG';

export const TAG_MANAGER_BOOTSTRAP_SCRIPT = `(function (win, doc) {
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
