"use client";
import React, { useEffect, useState } from "react";

interface Usuario {
  id: number;
  nombre_usuario: string;
  nombre: string;
  apellido: string;
  rol: string;
  email: string;
}

// Roles permitidos según backend
const roles = ["ADMIN", "ALMACEN", "VENTAS_LOCAL", "VENTAS_PEDIDOS", "CONTABLE", "PUERTA"];

export default function UsuariosPage() {
  const [search, setSearch] = useState("");
  const [filterRol, setFilterRol] = useState<string>("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // --- Filtro y búsqueda de usuarios (frontend) ---
  // Esto debe ir justo antes del return JSX
  const usuariosFiltrados: Usuario[] = usuarios.filter((u: Usuario) => {
    const matchSearch =
      u.nombre_usuario.toLowerCase().includes(search.toLowerCase()) ||
      u.nombre.toLowerCase().includes(search.toLowerCase()) ||
      u.apellido.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRol = filterRol ? u.rol === filterRol : true;
    return matchSearch && matchRol;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nombre_usuario: "",
    nombre: "",
    apellido: "",
    rol: "VENTAS_PEDIDOS",
    email: "",
    contrasena: ""
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", apellido: "", email: "", rol: "VENDEDOR", contrasena: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  // Editar usuario
  const handleEditClick = (user: Usuario) => {
    setEditUser(user);
    setEditForm({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      rol: user.rol,
      contrasena: ""
    });
    setEditError(null);
  };

  const handleEditInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token || !editUser) throw new Error("No autenticado");
      const API_URL = `http://127.0.0.1:8001/auth/usuarios/${editUser.id}`;
      const body: Record<string, unknown> = {};
      if (editForm.nombre !== editUser.nombre) body.nombre = editForm.nombre;
      if (editForm.apellido !== editUser.apellido) body.apellido = editForm.apellido;
      if (editForm.email !== editUser.email) body.email = editForm.email;
      if (editForm.rol !== editUser.rol) body.rol = editForm.rol;
      if (editForm.contrasena) body.contrasena = editForm.contrasena;
      if (Object.keys(body).length === 0) throw new Error("No hay cambios para guardar");
      const res = await fetch(API_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al modificar usuario");
      }
      setEditUser(null);
      fetchUsuarios();
    } catch (e: unknown) {
      if (e instanceof Error) {
        setEditError(e.message);
      } else {
        setEditError("Error desconocido");
      }
    } finally {
      setEditLoading(false);
    }
  };

  // Eliminar usuario
  const handleDelete = async (user: Usuario) => {
    if (!window.confirm(`¿Seguro que deseas eliminar al usuario ${user.nombre_usuario}?`)) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) throw new Error("No autenticado");
      const API_URL = `https://quimex.sistemataup.online/auth/usuarios/${user.id}`;
      const res = await fetch(API_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al eliminar usuario");
      }
      fetchUsuarios();
    } catch (e: unknown) {
      if (e instanceof Error) {
        alert(e.message);
      } else {
        alert("Error desconocido");
      }
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const fetchUsuarios = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) {
        setError("No autenticado. Inicie sesión.");
        setLoading(false);
        return;
      }
      // Cambia esta URL si tu backend está en otro host/puerto
      const API_URL = "https://quimex.sistemataup.online/auth/usuarios";
      const res = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new Error("Token inválido o sesión expirada. Inicie sesión nuevamente.");
      if (res.status === 403) throw new Error("No tiene permisos para ver los usuarios.");
      if (!res.ok) throw new Error("Error al obtener usuarios");
      const data = await res.json();
      setUsuarios(data.usuarios || []);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Error desconocido");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) throw new Error("No autenticado");
      const res = await fetch("/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear usuario");
      }
      setShowForm(false);
      setForm({ nombre_usuario: "", nombre: "", apellido: "", rol: "VENDEDOR", email: "", contrasena: "" });
      fetchUsuarios();
    } catch (e: unknown) {
      if (e instanceof Error) {
        setFormError(e.message);
      } else {
        setFormError("Error desconocido");
      }
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Administrar Usuarios</h1>
      <button
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        onClick={() => setShowForm((v) => !v)}
      >
        {showForm ? "Cancelar" : "Crear nuevo usuario"}
      </button>
      {showForm && (
        <form className="mb-6 p-4 border rounded bg-gray-50" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <input
              className="border p-2 rounded"
              name="nombre_usuario"
              placeholder="Usuario"
              value={form.nombre_usuario}
              onChange={handleInput}
              required
            />
            <input
              className="border p-2 rounded"
              name="email"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={handleInput}
              required
            />
            <input
              className="border p-2 rounded"
              name="nombre"
              placeholder="Nombre"
              value={form.nombre}
              onChange={handleInput}
              required
            />
            <input
              className="border p-2 rounded"
              name="apellido"
              placeholder="Apellido"
              value={form.apellido}
              onChange={handleInput}
              required
            />
            <select
              className="border p-2 rounded"
              name="rol"
              value={form.rol}
              onChange={handleInput}
              required
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              className="border p-2 rounded"
              name="contrasena"
              placeholder="Contraseña"
              type="password"
              value={form.contrasena}
              onChange={handleInput}
              required
            />
          </div>
          {formError && <p className="text-red-600 mt-2">{formError}</p>}
          <button
            type="submit"
            className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            disabled={formLoading}
          >
            {formLoading ? "Creando..." : "Crear usuario"}
          </button>
        </form>
      )}
      {loading && <p>Cargando usuarios...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <>
          <div className="flex flex-col md:flex-row gap-2 mb-4 items-center">
            <input
              type="text"
              className="border p-2 rounded w-full md:w-64"
              placeholder="Buscar usuario, nombre, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="border p-2 rounded w-full md:w-48"
              value={filterRol}
              onChange={e => setFilterRol(e.target.value)}
            >
              <option value="">Todos los roles</option>
              {roles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="min-w-full border border-gray-300 rounded text-xs md:text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-2 border">ID</th>
                  <th className="px-2 py-2 border">Usuario</th>
                  <th className="px-2 py-2 border">Nombre</th>
                  <th className="px-2 py-2 border">Apellido</th>
                  <th className="px-2 py-2 border">Rol</th>
                  <th className="px-2 py-2 border">Email</th>
                  <th className="px-2 py-2 border">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 border text-center">{u.id}</td>
                    <td className="px-2 py-2 border break-all">{u.nombre_usuario}</td>
                    <td className="px-2 py-2 border break-all">{u.nombre}</td>
                    <td className="px-2 py-2 border break-all">{u.apellido}</td>
                    <td className="px-2 py-2 border">{u.rol}</td>
                    <td className="px-2 py-2 border break-all">{u.email}</td>
                    <td className="px-2 py-2 border text-center">
                      <button className="mr-2 px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600" onClick={() => handleEditClick(u)}>Editar</button>
                      <button className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700" onClick={() => handleDelete(u)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal de edición */}
      {editUser && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg min-w-[350px]">
            <h2 className="text-lg font-bold mb-4">Editar usuario: {editUser.nombre_usuario}</h2>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <input className="border p-2 rounded w-full" name="nombre" placeholder="Nombre" value={editForm.nombre} onChange={handleEditInput} required />
              <input className="border p-2 rounded w-full" name="apellido" placeholder="Apellido" value={editForm.apellido} onChange={handleEditInput} required />
              <input className="border p-2 rounded w-full" name="email" placeholder="Email" type="email" value={editForm.email} onChange={handleEditInput} required />
              <select className="border p-2 rounded w-full" name="rol" value={editForm.rol} onChange={handleEditInput} required>
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <input className="border p-2 rounded w-full" name="contrasena" placeholder="Nueva contraseña (opcional)" type="password" value={editForm.contrasena} onChange={handleEditInput} />
              {editError && <p className="text-red-600 mt-2">{editError}</p>}
              <div className="flex justify-end space-x-2">
                <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => setEditUser(null)}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={editLoading}>{editLoading ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
