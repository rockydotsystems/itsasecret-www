export const AUTH_SCRIPT = `
(function() {
  var form = document.getElementById('auth-form');
  if (!form) return;
  var action = form.getAttribute('data-auth-action');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var email = form.querySelector('[name=email]').value;
    var password = form.querySelector('[name=password]').value;
    var submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
      var kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
      var rawPub = await crypto.subtle.exportKey('raw', kp.publicKey);
      var clientPubkey = btoa(String.fromCharCode.apply(null, new Uint8Array(rawPub)));

      var resp = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, clientPubkey: clientPubkey })
      });

      if (!resp.ok) {
        var err = await resp.json().catch(function() { return { error: 'Request failed' }; });
        alert(err.error || 'Something went wrong');
        submitBtn.disabled = false;
        submitBtn.textContent = action.includes('register') ? 'Create account' : 'Log in';
        return;
      }

      var data = await resp.json();

      var rawPriv = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      localStorage.setItem('ecdhPrivKey', btoa(String.fromCharCode.apply(null, new Uint8Array(rawPriv))));
      localStorage.setItem('sessionToken', data.token);
      localStorage.setItem('serverPubkey', data.serverPubkey);
      localStorage.setItem('orgKeys', JSON.stringify(data.orgKeys));

      window.location.href = '/dashboard';
    } catch (err) {
      alert('Error: ' + (err.message || 'unknown'));
      submitBtn.disabled = false;
      submitBtn.textContent = action.includes('register') ? 'Create account' : 'Log in';
    }
  });
})();
`;
