function getVirtualUser(user) {
  if (user) {
    const { _id, role, name, email, collectivities, model } = user;
    const virtualUser = { _id, role, name, email, collectivities, model};
    return virtualUser;
  }
  return undefined;
}

async function createPatches(document, user) {
  if (user) {
    document._user = getVirtualUser(user);
  }
  
  document.updatedAt = new Date();
  
  await document.save();
  
  return document;
}

module.exports = { getVirtualUser, createPatches };
