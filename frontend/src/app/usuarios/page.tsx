"use client";
import React, { useEffect, useState } from "react";

// Configuración de la API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online';

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
  const [editForm, setEditForm] = useState({ nombre: "", apellido: "", email: "", rol: "VENTAS_PEDIDOS", contrasena: "" });
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
      const API_URL = `${API_BASE_URL}/auth/usuarios/${editUser.id}`;
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
        throw new Error(err.message || err.error || "Error al modificar usuario");
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

  // Eliminar usuario (internamente usa eliminación lógica)
  const handleDelete = async (user: Usuario) => {
    if (user.nombre_usuario === 'usuario1') {
      alert('No se puede eliminar el usuario maestro.');
      return;
    }
    
    if (!window.confirm(`¿Seguro que deseas eliminar al usuario ${user.nombre_usuario}?`)) return;
    
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) throw new Error("No autenticado");
      const API_URL = `${API_BASE_URL}/auth/usuarios/${user.id}`;
      const res = await fetch(API_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Error al eliminar usuario");
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
      const API_URL = `${API_BASE_URL}/auth/usuarios`;
      const res = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new Error("Token inválido o sesión expirada. Inicie sesión nuevamente.");
      if (res.status === 403) throw new Error("No tiene permisos para ver los usuarios.");
      if (!res.ok) throw new Error("Error al obtener usuarios");
      const data = await res.json();
      setUsuarios(data.usuarios || data || []);
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
      const API_URL = `${API_BASE_URL}/auth/register`;
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || "Error al crear usuario");
      }
      setShowForm(false);
      setForm({ nombre_usuario: "", nombre: "", apellido: "", rol: "VENTAS_PEDIDOS", email: "", contrasena: "" });
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
    <div className="min-h-screen bg-[#312b81] text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold mb-6 text-center text-indigo-700">Administrar Usuarios</h1>
        <div className="flex justify-between items-center mb-6">
          <button
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "+ Crear Nuevo Usuario"}
          </button>
          <div className="text-sm text-gray-600">
            Total de usuarios: <span className="font-bold text-indigo-600">{usuariosFiltrados.length}</span>
          </div>
        </div>
      {showForm && (
        <div className="mb-8 p-6 border-2 border-indigo-200 rounded-lg bg-indigo-50">
          <h2 className="text-xl font-semibold mb-4 text-indigo-800">Crear Nuevo Usuario</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Usuario</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  name="nombre_usuario"
                  placeholder="Ingrese nombre de usuario"
                  value={form.nombre_usuario}
                  onChange={handleInput}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  name="email"
                  placeholder="email@ejemplo.com"
                  type="email"
                  value={form.email}
                  onChange={handleInput}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  name="nombre"
                  placeholder="Nombre"
                  value={form.nombre}
                  onChange={handleInput}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  name="apellido"
                  placeholder="Apellido"
                  value={form.apellido}
                  onChange={handleInput}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  name="rol"
                  value={form.rol}
                  onChange={handleInput}
                  required
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  name="contrasena"
                  placeholder="Contraseña (mín. 8 caracteres)"
                  type="password"
                  value={form.contrasena}
                  onChange={handleInput}
                  required
                  minLength={8}
                />
              </div>
            </div>
            {formError && <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{formError}</div>}
            <div className="flex justify-end mt-6">
              <button
                type="submit"
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                disabled={formLoading}
              >
                {formLoading ? "Creando Usuario..." : "Crear Usuario"}
              </button>
            </div>
          </form>
        </div>
      )}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Cargando usuarios...</p>
        </div>
      )}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}
      {!loading && !error && (
        <>
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Usuario</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Buscar por usuario, nombre, apellido o email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="w-full md:w-64">
                <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Rol</label>
                <select
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  value={filterRol}
                  onChange={e => setFilterRol(e.target.value)}
                >
                  <option value="">Todos los roles</option>
                  {roles.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-indigo-600">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Usuario</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Nombre Completo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Rol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {usuariosFiltrados.length > 0 ? (
                    usuariosFiltrados.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.id}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{u.nombre_usuario}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{u.nombre} {u.apellido}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            u.rol === 'ADMIN' ? 'bg-red-100 text-red-800' :
                            u.rol === 'VENTAS_LOCAL' ? 'bg-green-100 text-green-800' :
                            u.rol === 'VENTAS_PEDIDOS' ? 'bg-blue-100 text-blue-800' :
                            u.rol === 'ALMACEN' ? 'bg-yellow-100 text-yellow-800' :
                            u.rol === 'CONTABLE' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {u.rol}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{u.email}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-center space-x-2">
                          <button 
                            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm font-medium" 
                            onClick={() => handleEditClick(u)}
                          >
                            Editar
                          </button>
                          <button 
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium" 
                            onClick={() => handleDelete(u)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        {search || filterRol ? 'No se encontraron usuarios con los filtros aplicados.' : 'No hay usuarios registrados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal de edición */}
      {editUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 text-gray-900">
                Editar Usuario: <span className="text-indigo-600">{editUser.nombre_usuario}</span>
              </h2>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input 
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                    name="nombre" 
                    placeholder="Nombre" 
                    value={editForm.nombre} 
                    onChange={handleEditInput} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                  <input 
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                    name="apellido" 
                    placeholder="Apellido" 
                    value={editForm.apellido} 
                    onChange={handleEditInput} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input 
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                    name="email" 
                    placeholder="Email" 
                    type="email" 
                    value={editForm.email} 
                    onChange={handleEditInput} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select 
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                    name="rol" 
                    value={editForm.rol} 
                    onChange={handleEditInput} 
                    required
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                  <input 
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                    name="contrasena" 
                    placeholder="Dejar vacío para mantener actual" 
                    type="password" 
                    value={editForm.contrasena} 
                    onChange={handleEditInput}
                    minLength={8}
                  />
                  <p className="text-xs text-gray-500 mt-1">Opcional - Solo llenar si desea cambiar la contraseña</p>
                </div>
                {editError && (
                  <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                    {editError}
                  </div>
                )}
                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button" 
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors" 
                    onClick={() => setEditUser(null)}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50" 
                    disabled={editLoading}
                  >
                    {editLoading ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
