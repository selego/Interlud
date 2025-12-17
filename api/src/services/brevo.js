const { capture } = require('./sentry');
const { BREVO_KEY, ENVIRONMENT } = require('../config');

const api = async (path, options = {}) => {
  const fetch = await import('node-fetch');
  const res = await fetch.default(`https://api.brevo.com/v3${path}`, {
    ...options,
    headers: {
      'api-key': BREVO_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.raw()['content-type'];

  if (!res.ok) {
    let errorDetails;
    try {
      if (contentType?.length && contentType[0].includes('application/json')) {
        errorDetails = await res.json();
      } else {
        errorDetails = await res.text();
      }
    } catch (e) {
      errorDetails = 'Could not parse error response';
    }

    const error = new Error(`Brevo API Error: ${res.status} ${res.statusText}`);
    error.status = res.status;
    error.statusText = res.statusText;
    error.details = errorDetails;
    error.response = res;

    console.error('Brevo API Error Details:', {
      url: `https://api.brevo.com/v3${path}`,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers.raw(),
      body: errorDetails,
      requestBody: options.body ? JSON.parse(options.body) : null,
    });

    throw error;
  }

  if (contentType?.length && contentType[0].includes('application/json')) {
    return await res.json();
  }

  if (contentType?.length && contentType[0].includes('application/pdf')) {
    return res;
  }

  return await res.text();
};

// https://developers.sendinblue.com/reference#sendtransacemail
async function sendEmail(htmlContent, { subject, sender, to = [], attachment = null, params = null, tags = [], cc = [], bcc = [], replyTo }) {
  const body = { to, sender, htmlContent, subject };
  if (params) body.params = params;
  if (attachment) body.attachment = attachment;
  if (tags.length) body.tags = tags;
  if (cc.length) body.cc = cc;
  if (bcc.length) body.bcc = bcc;
  if (replyTo) body.replyTo = replyTo;
  const response = await api('/smtp/email', { method: 'POST', body: JSON.stringify(body) });

  return response;
}

// https://developers.sendinblue.com/reference#sendtransacemail
async function sendTemplate(id, { params, emailTo, cc, bcc, attachment } = {}) {
  try {
    const body = { templateId: parseInt(id) };
    if (emailTo) body.to = emailTo;
    if (cc?.length) body.cc = cc;
    if (bcc?.length) body.bcc = bcc;
    if (params) body.params = params;
    if (attachment) body.attachment = attachment;
    const mail = await api('/smtp/email', { method: 'POST', body: JSON.stringify(body) });
    return mail;
  } catch (e) {
    console.log('Erreur in sendTemplate', e);
    capture(e);
  }
}

const downloadAttachment = async (token) => {
  try {
    const res = await api(`/inbound/attachments/${token}`, { method: 'GET' });
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  } catch (e) {
    capture(e);
  }
};

/**
 * https://api.sendinblue.com/v3/contacts
 * @param email {string}
 * @param attributes {object}
 * @param emailBlacklisted {boolean}
 * @param smsBlacklisted {boolean}
 * @param listIds {integer[]}
 * @param updateEnabled {boolean}
 * @param smtpBlacklistSender {string[]}
 * @returns {Promise<void>}
 */
async function createContact({ email, attributes, emailBlacklisted, smsBlacklisted, listIds, updateEnabled, smtpBlacklistSender } = {}) {
  const body = {
    email,
    attributes,
    emailBlacklisted,
    smsBlacklisted,
    listIds,
    updateEnabled,
    smtpBlacklistSender,
  };

  return await api('/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * https://developers.sendinblue.com/reference#deletecontact
 * @param id {string|number} Email (urlencoded) OR ID of the contact
 * @returns {Promise<void>}
 */
async function deleteContact(id) {
  const identifier = typeof id === 'string' ? encodeURIComponent(id) : id;

  return await api(`/contacts/${identifier}`, {
    method: 'DELETE',
  });
}

/**
 * https://developers.sendinblue.com/reference#updatecontact
 * @param id {string|number} Email (urlencoded) OR ID of the contact
 * @param attributes {object}
 * @param emailBlacklisted {boolean}
 * @param smsBlacklisted {boolean}
 * @param listIds {integer[]}
 * @param unlinkListIds {integer[]}
 * @param smtpBlacklistSender {string[]}
 * @returns {Promise<void>}
 */
async function updateContact(id, { attributes, emailBlacklisted, smsBlacklisted, listIds, unlinkListIds, smtpBlacklistSender } = {}) {
  const identifier = typeof id === 'string' ? encodeURIComponent(id) : id;

  const body = {
    attributes,
    emailBlacklisted,
    smsBlacklisted,
    listIds,
    unlinkListIds,
    smtpBlacklistSender,
  };

  return await api(`/contacts/${identifier}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function sync(obj) {
  try {
    const user = JSON.parse(JSON.stringify(obj));

    if (!user) {
      console.log('ERROR WITH ', obj);
    }

    const email = user.email;

    const attributes = {};
    for (const key of Object.keys(user)) {
      if (key.indexOf('_at') !== -1) {
        if (user[key]) {
          if (typeof user[key] === 'string') {
            attributes[key.toUpperCase()] = user[key].slice(0, 10);
          } else {
            console.log('WRONG', user[key]);
          }
        }
      } else {
        attributes[key.toUpperCase()] = user[key];
      }
    }

    // TO CHANGE
    attributes.FIRSTNAME && (attributes.PRENOM = attributes.FIRSTNAME);
    attributes.LASTNAME && (attributes.NOM = attributes.LASTNAME);

    let listIds = [];
    if (ENVIRONMENT === 'production') listIds.push(9);
    else listIds.push(11);

    delete attributes.EMAIL;
    delete attributes.PASSWORD;
    delete attributes.__V;
    delete attributes._ID;
    delete attributes.LASTNAME;
    delete attributes.FIRSTNAME;
    delete attributes.FORGOTPASSWORDRESETTOKEN;
    delete attributes.INVITATIONTOKEN;

    try {
      await updateContact(email, { attributes, listIds });
    } catch (e) {
      await createContact({ email, attributes, listIds });
    }
  } catch (e) {
    console.log('error', e);
  }
}

async function unsync(obj) {
  try {
    await deleteContact(obj.email);
  } catch (e) {
    console.log("Can't delete in sendinblue", obj.email);
  }
}

async function getEmailsList({ email, templateId, messageId, startDate, endDate, sort, limit, offset } = {}) {
  try {
    // const body = {
    //   email,
    //   templateId,
    //   messageId,
    //   startDate,
    //   endDate,
    //   sort,
    //   limit,
    //   offset,
    // };
    // const filteredBody = Object.entries(body)
    //   .filter(([, value]) => value !== undefined)
    //   .reduce((obj, [key, value]) => {
    //     obj[key] = value;
    //     return obj;
    //   }, {});
    return await api(`/smtp/emails?email=${email}`, { method: 'GET' });
  } catch (e) {
    console.log('Erreur in getEmail', e);
    capture(e);
  }
}

async function getEmailContent(uuid) {
  try {
    return await api(`/smtp/emails/${uuid}`, { method: 'GET' });
  } catch (e) {
    console.log('Erreur in getEmail', e);
    capture(e);
  }
}

module.exports = { sync, unsync, sendEmail, sendTemplate, createContact, updateContact, deleteContact, getEmailsList, getEmailContent, downloadAttachment };
