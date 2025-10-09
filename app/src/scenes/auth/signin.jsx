import React, { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import store from "@/services/store"
import toast from "react-hot-toast"

import LoadingButton from "@/components/loadingButton"

import api from "@/services/api"

export default () => {
  const [values, setValues] = useState({ email: "admin@selego.co", password: "abc123$$" })

  const { user, setUser } = store()

  const navigate = useNavigate()

  const send = async () => {
    try {
      const { user, token } = await api.post(`/user/signin`, values)
      if (token) api.setToken(token)
      if (user) setUser(user)
    } catch (e) {
      console.log("e", e)
      toast.error(e.code)
    }
  }

  if (user) navigate("/")

  return (
    // Auth Wrapper
    <div>
      <div
        onSubmit={async (values, actions) => {
          try {
            const { user, token } = await api.post(`/user/signin`, values)
            if (token) api.setToken(token)
            if (user) setUser(user)
          } catch (e) {
            console.log("e", e)
            toast.error(e.code)
          }
          actions.setSubmitting(false)
        }}
      >
        <div>
          <div className="mb-[25px]">
            <div className="flex flex-col-reverse">
              <input className="peer signInInputs " name="email" type="email" id="email" value={values.email} onChange={e => setValues({ ...values, email: e.target.value })} />
              <label className="peer-focus:text-[#116eee]" htmlFor="email">
                E-mail address
              </label>
            </div>
          </div>
          <div className="mb-[25px]">
            <div className="flex flex-col-reverse">
              <input
                className="peer signInInputs"
                name="password"
                type="password"
                id="password"
                value={values.password}
                onChange={e => setValues({ ...values, password: e.target.value })}
              />
              <label className="peer-focus:text-[#116eee]" htmlFor="password">
                Password
              </label>
            </div>
          </div>
          {/* Forget Password */}
          <div className="text-right mb-[20px] mt-[-20px] text-[12px]">
            <Link to="/auth/forgot">Forgot password ?</Link>
          </div>
          {/* SignIn Button */}
          <LoadingButton
            className="font-[Helvetica] w-[220px] bg-[#007bff] hover:bg-[#0069d9] text-[#fff] rounded-[30px] m-auto block text-[16px] p-[8px] min-h-[42px] "
            onClick={send}
            color="primary"
          >
            Signin
          </LoadingButton>
        </div>
      </div>
      <div className="mt-10 text-center text-sm">
        Dont have account ?{" "}
        <Link className="text-primary" to="/auth/signup">
          Create new account
        </Link>
      </div>
    </div>
  )
}
