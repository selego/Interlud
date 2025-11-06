function getVirtualUser(user) {
  if (user) {
    const { _id, role, name, email, collectivities, model } = user;
    const virtualUser = { _id, role, name, email, collectivities, model};
    return virtualUser;
  }
  return undefined;
}

module.exports = { getVirtualUser };
