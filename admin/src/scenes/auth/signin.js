import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { BsEye, BsEyeSlash } from "react-icons/bs";

import useStore from "../../store";
import api from "../../services/api";

import LoadingButton from "../../components/LoadingButton";

export default () => {
  const { user, setUser } = useStore();
  const [seePassword, setSeePassword] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);
  const [values, setValues] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBtnLoading(true);
    try {
      const { ok, data, user, token } = await api.post(`/admin/user/signin`, values);
      if (!ok) toast.error(data.message);

      if (token) api.setToken(token);
      if (user) setUser(user);
      setBtnLoading(false);
    } catch (e) {
      console.log("e", e);
      setBtnLoading(false);
    }
  };

  if (user) return <Navigate to="/" />;

  return (
    <div className="relative pb-10">
      <div className="p-4 px-20 pt-10 mx-auto mb-10 font-mono text-2xl font-bold text-center">Talent R</div>

      <div className="flex items-center justify-center flex-col w-[90vw] md:w-[500px] mx-auto">
        <h1 className="mb-12 text-3xl font-semibold text-center text-black">Se connecter</h1>

        <form className="w-full space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-y-2">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              name="email"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
              className="w-full"
              placeholder="Entrez votre adresse e-mail"
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password">Mot de passe</label>
              <Link className="leading-6 text-app" to="/auth/forgot">
                Mot de passe oublié ?
              </Link>
            </div>
            <div className="relative">
              <input
                type={seePassword ? "text" : "password"}
                name="password"
                value={values.password}
                onChange={(e) => setValues({ ...values, password: e.target.value })}
                className="w-full"
              />
              <div className="absolute -translate-y-1/2 top-1/2 right-4">
                {seePassword ? (
                  <BsEyeSlash size={18} className="cursor-pointer text-app" onClick={() => setSeePassword(false)} />
                ) : (
                  <BsEye size={18} className="cursor-pointer" onClick={() => setSeePassword(true)} />
                )}
              </div>
            </div>
          </div>

          <LoadingButton
            loading={btnLoading}
            className="py-3.5 w-full text-center bg-black text-white rounded-lg !mt-12"
            disabled={!values?.email || !values?.password}
            type="submit"
            onClick={handleSubmit}
          >
            Se connecter
          </LoadingButton>
        </form>
      </div>
    </div>
  );
};
