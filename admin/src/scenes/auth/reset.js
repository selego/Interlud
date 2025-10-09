import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import queryString from "query-string";
import toast from "react-hot-toast";

import LoadingButton from "../../components/LoadingButton";

import api from "../../services/api";

export default ({ location }) => {
  const navigate = useNavigate();
  const [values, setValues] = useState({ password: "", password1: "" });
  const [btnLoading, setBtnLoading] = useState(false);

  const send = async () => {
    setBtnLoading(true);
    try {
      const { token } = queryString.parse(location.search);
      const { ok, data } = await api.post("/admin/user/forgot_password_reset", {
        ...values,
        token,
      });
      if (!ok) throw new toast.error(data.message);
      toast.success("Success!");
      navigate("/");
    } catch (e) {
      console.log(e);
    } finally {
      setBtnLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="p-4 px-20 pt-10 mx-auto mb-10 font-mono text-2xl font-bold text-center">Talent R</div>

      <div className="flex items-center justify-center flex-col mx-auto w-[90vw] md:w-[500px]">
        <div className="font-[Helvetica] text-center text-[32px] font-semibold	mb-[15px]">Créer un nouveau mot de passe</div>
        <div>
          <div>
            <div className="border-[1px] border-gray-200 bg-gray-50 text-gray-500 p-2 rounded-md italic">Format : minimum 6 caractères, au moins une lettre</div>
            <div className="mb-[25px] mt-4">
              <label htmlFor="password">Nouveau mot de passe</label>
              <input
                className="w-full mt-1"
                name="password"
                type="password"
                id="password"
                value={values.password}
                onChange={(e) => setValues({ ...values, password: e.target.value })}
              />
            </div>
            <LoadingButton loading={btnLoading} disabled={!values.password} className="py-3.5 w-full text-center bg-black text-white rounded-lg mt-5" onClick={send}>
              Créer
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
};
