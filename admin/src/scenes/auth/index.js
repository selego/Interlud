import React from "react";
import { Route, Routes } from "react-router-dom";

import Reset from "./reset";
import Forgot from "./forgot";
import Signin from "./signin";

const Auth = () => {
  return (
    <Routes>
      <Route path="reset" element={<Reset />} />
      <Route path="forgot" element={<Forgot />} />
      <Route path="/" element={<Signin />} />
    </Routes>
  );
};

export default Auth;
