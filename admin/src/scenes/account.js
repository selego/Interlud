/* eslint-disable react/display-name */
import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { BsEye, BsEyeSlash } from "react-icons/bs";

import Loader from "../components/Loader";
import LoadingButton from "../components/LoadingButton";
import Modal from "../components/Modal";

import api from "../services/api";
import useStore from "../store";

export default () => {
  const { user, setUser } = useStore();
  const [values, setValues] = useState(user);
  const [btnLoading, setBtnLoading] = useState(false);

  const handleSubmit = async () => {
    setBtnLoading(true);
    try {
      const {ok, data} = await api.put(`/user`, values);
      if (!ok) return toast.error(data.message);
      setUser(data);
      toast.success("Profile Updated successfully!");
    } catch (error) {
      console.log(error);
    } finally {
      setBtnLoading(false);
    }
  };

  if (!values) return <Loader />;

  return (
    <section className="shadow-input rounded-md shadow-sm border !text-sm">
      <div className="space-y-4">
        <div className="border-b p-3 text-lg font-medium">Your Account</div>
        <div className="px-3 flex flex-col gap-5">
          <div className="flex justify-between gap-5">
            <div className="flex flex-col gap-y-2  w-1/2">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                name="name"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                className="w-full"
                placeholder="Entrez votre prénom"
              />
            </div>
            <div className="flex flex-col gap-y-2 w-1/2">
              <label htmlFor="organization-email">Adresse e-mail</label>
              <input
                type="email"
                name="organization-email"
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
                className="w-full"
                placeholder="Entrez votre adresse e-mail"
              />
            </div>
          </div>

          <div className="flex justify-between gap-5">
            <ResetPassword />
          </div>
        </div>

        <div className="!mt-10 flex gap-3 border-t py-5 px-3 justify-end">
          <LoadingButton className="py-2 px-6 text-sm rounded-md bg-black text-white" loading={btnLoading} onClick={() => handleSubmit()}>
            Update
          </LoadingButton>
        </div>
      </div>
    </section>
  );
};

const ResetPassword = () => {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [btnLoading, setBtnLoading] = useState(false);
  const [seePasswords, setSeePasswords] = useState([false, false, false]);

  const resetpasswordHandle = async () => {
    setBtnLoading(true);
    try {
      const { ok, data } = await api.post("/user/reset_password", values);
      if (!ok) return toast.error(data.message);
      setOpen(false);
      toast.success("Password updated successfully!");
    } catch (error) {
      console.log(error);
    } finally {
      setBtnLoading(false);
    }
  };

  const togglePasswordVisibility = (index) => {
    setSeePasswords((prevState) => {
      const newState = [...prevState];
      newState[index] = !newState[index];
      return newState;
    });
  };

  return (
    <>
      <div className="flex flex-col gap-y-2 w-1/2">
        <label htmlFor="password">Password</label>
        <button className="border rounded-md py-2 px-3 text-left hover:bg-gray-100" onClick={() => setOpen(true)}>
          Reset password
        </button>
      </div>

      <Modal isOpen={open} className="!w-[90vw] md:!w-[700px] p-6" onClose={() => setOpen(false)}>
        <div className="mb-[25px] my-4">
          <label htmlFor="password">Current Password</label>
          <div className="relative mt-3">
            <input
              type={seePasswords[0] ? "text" : "password"}
              name="password"
              placeholder="Enter current password"
              value={values.password}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
              className="w-full"
            />
            <div className="absolute top-1/2 -translate-y-1/2 right-4 cursor-pointer" onClick={() => togglePasswordVisibility(0)}>
              {seePasswords[0] ? <BsEyeSlash /> : <BsEye />}
            </div>
          </div>
        </div>

        <div className="mb-[25px] mt-4">
          <label htmlFor="newPassword">New Password</label>
          <div className="relative">
            <input
              className="w-full mt-1"
              name="newPassword"
              type={seePasswords[1] ? "text" : "password"}
              placeholder="Enter new password"
              id="newPassword"
              value={values.newPassword}
              onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
            />
            <div className="absolute top-1/2 -translate-y-1/2 right-4 cursor-pointer" onClick={() => togglePasswordVisibility(1)}>
              {seePasswords[1] ? <BsEyeSlash /> : <BsEye />}
            </div>
          </div>
        </div>

        <div className="mb-[25px] mt-4">
          <label htmlFor="verifyPassword">Confirm New Password</label>
          <div className="relative">
            <input
              className="w-full mt-1"
              name="verifyPassword"
              type={seePasswords[2] ? "text" : "password"}
              placeholder="Confirm new password"
              id="verifyPassword"
              value={values.verifyPassword}
              onChange={(e) => setValues({ ...values, verifyPassword: e.target.value })}
            />
            <div className="absolute top-1/2 -translate-y-1/2 right-4 cursor-pointer" onClick={() => togglePasswordVisibility(2)}>
              {seePasswords[2] ? <BsEyeSlash /> : <BsEye />}
            </div>
          </div>
        </div>

        <div className="flex justify-end items-center">
          <LoadingButton
            className="btn btn-black mt-4 disabled:opacity-60 disabled:cursor-not-allowed"
            loading={btnLoading}
            disabled={!values.password || !values.newPassword || !values.verifyPassword}
            onClick={resetpasswordHandle}
          >
            Reset
          </LoadingButton>
        </div>
      </Modal>
    </>
  );
};
