import { api, post, notifyAuthChanged } from "./api";
export const listUsers = () => api("users");
export const createUser = ({ data }) => post("users", data);
export const deleteUser = ({ data }) => post(`users/${encodeURIComponent(data.id)}/delete`);
export async function updateUserPassword({ data }) {
  const result = await post(`users/${encodeURIComponent(data.id)}/password`, {
    password: data.password,
  });
  notifyAuthChanged();
  return result;
}
