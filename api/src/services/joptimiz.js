const config = require('../config');

const getAuthorizationUrl = (state) => {
  const url = new URL(`${config.JOPTIMIZ_URL}/oauth/authorize`);
  url.searchParams.set('client_id', config.JOPTIMIZ_CLIENT_ID);
  url.searchParams.set('redirect_uri', config.JOPTIMIZ_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
};

const exchangeCode = async (code) => {
  const fetch = await import('node-fetch');
  const res = await fetch.default(`${config.JOPTIMIZ_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.JOPTIMIZ_CLIENT_ID,
      client_secret: config.JOPTIMIZ_CLIENT_SECRET,
      redirect_uri: config.JOPTIMIZ_REDIRECT_URI,
    }).toString(),
  });
  return res.json();
};

const getUserInfo = async (accessToken) => {
  const fetch = await import('node-fetch');
  const res = await fetch.default(`${config.JOPTIMIZ_URL}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json();
};

module.exports = { getAuthorizationUrl, exchangeCode, getUserInfo };
