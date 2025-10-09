import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Loader from "../../components/Loader";
import LoadingButton from "../../components/LoadingButton";
import TabItem from "../../components/TabItem";
import SelectCompany from "../../components/SelectCompany";

import api from "../../services/api";

const INFORMATION = "INFORMATION";
const RAW_DATA = "RAW_DATA";

export default () => {
  const { id } = useParams();
  const [user, setUser] = useState();
  const [tab, setTab] = useState(INFORMATION);

  useEffect(() => {
    get();
  }, [id]);

  const get = async () => {
    try {
      const { data, ok } = await api.get(`/user/${id}`);
      if (!ok) return toast.error(data.message);
      setUser(data);
    } catch (e) {
      console.log(e);
    }
  };

  if (!user) return <Loader />;

  return (
    <>
      <div className="w-full gap-x-4 gap-y-2 ">
        <nav className="flex items-center gap-2 pl-2">
          <TabItem tab={INFORMATION} title="Information" setTab={setTab} active={tab === INFORMATION} />
          <TabItem tab={RAW_DATA} title="Raw Data" setTab={setTab} active={tab === RAW_DATA} />
        </nav>
        <div className="bg-white rounded-md p-6 border border-primary-black-50">
          {tab === INFORMATION && <Information user={user} setUser={setUser} />}
          {tab === RAW_DATA && <RawData user={user} />}
        </div>
      </div>
    </>
  );
};

const Information = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [values, setValues] = useState(user);
  const [btnLoading, setBtnLoading] = useState(false);

  const onUpdate = async () => {
    setBtnLoading(true);
    try {
      const { data, ok} = await api.put(`/user/${user._id}`, values);
      if (!ok) return toast.error(data.message);
      toast.success("Updated!");
      setUser(data);
    } catch (e) {
      console.log(e);
    } finally {
      setBtnLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      const { data, ok } = await api.remove(`/user/${user._id}`);
      if (!ok) return toast.error(data.message);
      toast.success("Delete!");
      navigate("/user");
    } catch (e) {
      console.log(e);
    }
  };
  
  return (
    <div>
      <div className="grid grid-cols-2 gap-5 mb-3">
        <div className="w-full">
          <div className="text-sm font-medium mb-2">Nom</div>
          <input className="input" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
        </div>

        <div className="w-full">
          <div className="text-sm font-medium mb-2">E-mail</div>
          <input className="input" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        </div>


      </div>

      <div className="flex items-center justify-end space-x-2 mt-10">
        <LoadingButton className="btn btn-black" loading={btnLoading} onClick={() => onUpdate()}>
          Mise à jour
        </LoadingButton>

        <button className="btn bg-red-500" onClick={onDelete}>
          Supprimer
        </button>
      </div>
    </div>
  );
};

const RawData = ({ user }) => {
  return (
    <div className="text-sm">
      <pre className=" break-all whitespace-pre-wrap">{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
};
