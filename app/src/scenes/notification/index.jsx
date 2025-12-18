import { useState, useEffect } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";
import useStore from "@/services/store";

export default function Notification() {
  const { user } = useStore();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data, ok, code } = await api.post('/notification/search', { user_id: user._id });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setNotifications(data);
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const { ok, code } = await api.put(`/notification/${notificationId}`, { read_at: new Date()  });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      fetchNotifications();
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Notifications</h1>
        <p className="text-gray-600">
          {notifications.filter(n => !n.read_at).length} notification(s) non lue(s)
        </p>
      </div>
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className={`relative p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${
                !notification.read_at ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-200'
              }`}
            >
              {!notification.read_at && (
                <div className="absolute top-4 left-2 w-2 h-2 bg-blue-600 rounded-full"></div>
              )}
              
              <div className={`${!notification.read_at ? 'ml-4' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <p className={`text-sm font-medium ${
                    !notification.read_at ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    {notification.message}
                  </p>
                  <span className="text-xs text-gray-500 ml-4 flex-shrink-0">
                    {notification.createdAt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                {notification.user_name && (
                  <p className="text-xs text-gray-500 mb-2">
                    De: {notification.user_name}
                  </p>
                )}
                
                <div className="flex justify-between items-center">
                  {notification.link && (
                    <a
                      href={notification.link}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Voir plus
                    </a>
                  )}
                  
                  {!notification.read_at && (
                    <button
                      onClick={() => markAsRead(notification._id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto"
                    >
                      Marquer comme lu
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}