import { create } from 'zustand';
import axios from 'axios';

const API_URL = 'http://localhost:3001';

const useTaskStore = create((set) => ({
  tasks: [],
  loading: false,
  error: null,
  
  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const token = localStorage.getItem('aps_token');
      if (!token) {
        throw new Error('Brak autoryzacji');
      }
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const response = await axios.get(`${API_URL}/api/tasks`, config);
      set({ tasks: response.data, loading: false });
    } catch (error) {
      set({ error, loading: false });
      if (error.response?.status === 401) {
        // Handle logout in the component
        console.error("Unauthorized, need to log out.");
      }
    }
  },
}));

export default useTaskStore;
