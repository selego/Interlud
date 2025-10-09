import React, { useState } from "react"
import validator from "validator"
import toast from "react-hot-toast"

import LoadingButton from "@/components/loadingButton"

import api from "@/services/api"

export default () => {
  const [done, setDone] = useState(false)
  const [email, setEmail] = useState("")

  const send = async () => {
    try {
      if (!validator.isEmail(email)) toast.error("Invalid email address")

      const res = await api.post("/user/forgot_password", { email })
      if (!res.ok) throw res
      toast.success("Sent")
      setDone(true)
    } catch (e) {
      toast.error("Error", e.code)
    }
  }

  if (done) {
    return (
      // Auth Wrapper
      <div className="authWrapper font-myfont">
        <div className="font-[Helvetica] text-center text-[32px] font-semibold	mb-[15px]">Reset Password</div>
        {/* How Reset */}
        <div className="text-[16px] text-center mb-[30px] py-0	px-[30px] text-[#555]">
          Password recovery link has been sent to your email please check you inbox and follow the link to reset your password.
        </div>
      </div>
    )
  }

  return (
    // Auth Wrapper
    <div className="authWrapper font-myfont">
      <div className="font-[Helvetica] text-center text-[32px] font-semibold	mb-[15px]">Reset Password</div>
      {/* How Reset */}
      <div className="text-[16px] text-center mb-[30px] py-0	px-[30px] text-[#555]">Enter your email address below to receive the password reset link.</div>
      <div>
        <div>
          <div className="mb-[25px]">
            <div className="flex flex-col-reverse">
              <input className="signInInputs" name="email" type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} />
              <label className="peer-focus:text-[#116eee]" htmlFor="email">
                E-mail address
              </label>
            </div>
          </div>
          <LoadingButton className="font-[Helvetica] w-[220px] bg-[#28a745] text-[#fff] rounded-[30px] m-auto block text-[16px] p-[8px] min-h-[42px] " type="submit" onClick={send}>
            Send link
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
