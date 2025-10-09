import React, { useState } from "react"
import queryString from "query-string"
import toast from "react-hot-toast"
import { useNavigate, useLocation } from "react-router-dom"

import LoadingButton from "@/components/loadingButton"

import api from "@/services/api"

export default () => {
  const [values, setValues] = useState({ password: "", password1: "" })

  const navigate = useNavigate()
  const location = useLocation()

  const send = async () => {
    try {
      const { token } = queryString.parse(location.search)
      const res = await api.post("/user/forgot_password_reset", { ...values, token })
      if (!res.ok) throw res
      toast.success("Success!")
      navigate("/")
    } catch (e) {
      toast.error(`Error\n${e && e.code}`)
    }
  }

  return (
    <div className="authWrapper font-myfont">
      <div className="font-[Helvetica] text-center text-[32px] font-semibold	mb-[15px]">Create new Password</div>
      <div>
        <div>
          <div className="border-[1px] border-gray-200 bg-gray-50 text-gray-500 p-2 rounded-md italic">Format : minimum 6 characters, at least one letter</div>
          <div className="mb-[25px] mt-4">
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
                New Password
              </label>
            </div>
          </div>
          <div className="mb-[25px]">
            <div className="flex flex-col-reverse">
              <input
                className="peer signInInputs "
                name="password1"
                type="password"
                id="password1"
                value={values.password1}
                onChange={e => setValues({ ...values, password1: e.target.value })}
              />
              <label className="peer-focus:text-[#116eee]" htmlFor="password1">
                Retype Password
              </label>
            </div>
          </div>
          <LoadingButton
            className="font-[Helvetica] w-[220px] bg-[#007bff] hover:bg-[#0069d9] text-[#fff] rounded-[30px] m-auto block text-[16px] p-[8px] min-h-[42px] "
            onClick={send}
          >
            Create
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
