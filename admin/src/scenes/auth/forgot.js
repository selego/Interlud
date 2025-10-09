import React, { useState } from "react";
import validator from "validator";
import toast from "react-hot-toast";

import LoadingButton from "../../components/LoadingButton";

import api from "../../services/api";

export default () => {
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [btnLoading, setBtnLoading] = useState(false);

  const send = async () => {
    setBtnLoading(true);
    try {
      if (!validator.isEmail(email)) toast.error("Invalid email address");
      const { ok, data } = await api.post("/admin/user/forgot_password", { email });
      if (!ok) toast.error(data.message);
      toast.success("Sent");
      setDone(true);
    } catch (e) {
      console.log(e);
    } finally {
      setBtnLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="p-4 px-20 pt-10 mx-auto mb-10 font-mono text-2xl font-bold text-center">Talent R</div>

      <div className="mx-auto w-[90vw] md:w-[500px]">
        {done ? (
          <div className="">
            <div className="mb-12 text-3xl font-semibold text-center text-black">Réinitialiser le mot de passe</div>
            <div className="text-[#555] text-center">
              Le lien de récupération du mot de passe a été envoyé à votre adresse e-mail, veuillez vérifier votre boîte de réception et suivez le lien pour réinitialiser votre mot
              de passe.
            </div>
          </div>
        ) : (
          <>
            <h1 className="mb-12 text-3xl font-semibold text-center text-black">Réinitialiser le mot de passe</h1>

            <div className="mb-8 text-[#555] text-center">Entrez votre adresse e-mail ci-dessous pour définir un nouveau mot de passe.</div>
            <div>
              <div className="flex flex-col w-full gap-y-2">
                <label htmlFor="email">Adresse e-mail</label>
                <input name="email" type="email" id="email" className="w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <LoadingButton loading={btnLoading} className="py-3.5 w-full text-center bg-black text-white rounded-lg mt-5" disabled={!email} type="submit" onClick={send}>
                Envoyer un lien{" "}
              </LoadingButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
