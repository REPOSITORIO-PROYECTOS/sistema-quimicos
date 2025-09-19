'use client';

import { useEffect, useState, ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { useProductsContext, Producto } from "@/context/ProductsContext";
import BotonVolver from './BotonVolver';

// Interfaz para un item de precio especial en el estado del formulario
// Base de la API centralizada. Usa la variable de entorno NEXT_PUBLIC_API_URL si existe; 
// en caso contrario cae al dominio de producción para evitar 'undefined' en las rutas.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online';

interface ProductoPrecioEspecialItem {
  id_precio_especial?: number;
  producto_id: string;
  valor: number;
  activo: boolean;
  temp_key?: string;
  api_producto_nombre?: string;
  api_producto_id_original_api?: number;
  moneda?: 'ARS' | 'USD';
  precio_original?: number;
  nuevo_precio?: number;
  usar_precio_base?: boolean;
  margen_sobre_base?: number;
}

// Interfaz para el estado completo del formulario de actualización
interface FormState {
  nombre_razon_social: string;
  cuit: string; // CUIT como string
  direccion: string;
  localidad: string;
  provincia: string;
  codigo_postal: string; // CP como string
  telefono: string;
  email: string;
  contacto_principal: string; // Nombre/ID del contacto como string
  observaciones: string;
  precios_especiales_form: ProductoPrecioEspecialItem[];
}

// Tipo para los datos de UN precio especial como viene de la API /precios_especiales/obtener-por-cliente/ID_CLIENTE
interface PrecioEspecialDesdeAPI {
  id: number; // Este es id_precio_especial
  cliente_id: number;
  producto_id: number;
  producto_nombre: string;
  precio_unitario_fijo_ars: string; // Viene como string desde la API
  activo: boolean;
  moneda_original?: string;
  precio_original?: number | string;
  usar_precio_base?: boolean;
  margen_sobre_base?: number;
  // fecha_creacion y fecha_modificacion no son necesarias para el form
}

const initialFormState: FormState = {
  nombre_razon_social: '',
  cuit: '',
  direccion: '',
  localidad: '',
  provincia: '',
  codigo_postal: '',
  telefono: '',
  email: '',
  contacto_principal: '',
  observaciones: '',
  precios_especiales_form: [],
};

// Componente para mostrar preview del precio calculado con margen
function PrecioPreviewConMargen({ productoId, margen }: { productoId: string | number; margen: number }) {
  const [previewData, setPreviewData] = useState<{
    precio_base: number;
    precio_final: number;
    margen_aplicado: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Validaciones más estrictas
    if (!productoId || 
        productoId === '' || 
        margen === undefined || 
        margen === null || 
        isNaN(Number(margen))) {
      setPreviewData(null);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Convertir margen a decimal (dividir por 100)
    const margenDecimal = Number(margen) / 100;

    fetch(`${API_BASE_URL}/precios_especiales/calcular-precio-preview/${productoId}?margen=${margenDecimal}`, {
      headers
    })
      .then(async res => {
        if (res.ok) {
          return res.json();
        } else {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Error ${res.status}`);
        }
      })
      .then(data => {
        // La respuesta puede tener diferentes estructuras según el endpoint
        let precioBase = 0;
        let precioFinal = 0;
        
        if (data.calculos) {
          // Estructura nueva del endpoint de preview
          precioBase = Number(data.calculos.precio_base_ars || 0);
          precioFinal = Number(data.calculos.precio_con_margen_ars || 0);
        } else if (data.precio_final) {
          // Estructura anterior
          precioBase = Number(data.precio_base || 0);
          precioFinal = Number(data.precio_final || 0);
        } else {
          throw new Error('Estructura de respuesta no reconocida');
        }
        
        if (precioFinal > 0) {
          setPreviewData({
            precio_base: precioBase,
            precio_final: precioFinal,
            margen_aplicado: Number(margen)
          });
        } else {
          setPreviewData(null);
          setError('No se pudo calcular el precio. Verifique que el producto tenga un precio base válido.');
        }
      })
      .catch((err) => {
        console.error('Error calculating price preview:', err);
        setError(err.message || 'Error al calcular preview');
      })
      .finally(() => setLoading(false));
  }, [productoId, margen]);

  if (loading) return (
    <div className="text-sm text-gray-500 animate-pulse">
      🔄 Calculando precio...
    </div>
  );
  
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-1">
      <div className="text-xs text-red-700">
        ❌ <strong>Error:</strong> {error}
      </div>
      {(error.includes('Margen sobre base inválido') || error.includes('margen')) && (
        <div className="text-xs text-red-600 mt-1">
          💡 <strong>Ayuda:</strong> Para descuentos usa valores negativos (ej: -15 para 15% de descuento)
          <br />
          El descuento máximo permitido es -100% (producto gratis)
        </div>
      )}
    </div>
  );

  if (!previewData) return (
    <div className="text-xs text-gray-500">
      ℹ️ Precio no disponible
    </div>
  );

  const esDescuento = previewData.margen_aplicado < 0;
  const esAumento = previewData.margen_aplicado > 0;

  return (
    <div className={`${esDescuento ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'} border rounded-md p-2 mt-1`}>
      <div className="text-xs font-medium mb-1">
        {esDescuento ? '🏷️ Precio con Descuento' : '📊 Precio con Margen'}
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-600">Base:</span>
          <span className="font-medium">${previewData.precio_base.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">
            {esDescuento ? 'Desc:' : 'Marg:'}
          </span>
          <span className={`font-medium ${esDescuento ? 'text-orange-600' : esAumento ? 'text-green-600' : 'text-blue-600'}`}>
            {esDescuento ? `${previewData.margen_aplicado}%` : `+${previewData.margen_aplicado}%`}
          </span>
        </div>
        <div className="border-t pt-1" style={{ borderColor: esDescuento ? 'rgb(254 215 170)' : 'rgb(187 247 208)' }}>
          <div className="flex justify-between">
            <span className="text-gray-700 font-medium">Final:</span>
            <span className={`font-bold text-sm ${esDescuento ? 'text-orange-700' : 'text-green-700'}`}>
              ${previewData.precio_final.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function FormularioActualizacionCliente({ id_cliente }: { id_cliente: number | undefined }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  // Eliminado: preciosEspecialesOriginales, ya no se usa
  const [isLoading, setIsLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  // Guardar copia original de los precios cargados desde la API para comparar cambios
  const [preciosOriginales, setPreciosOriginales] = useState<PrecioEspecialDesdeAPI[] | null>(null);
  // Estado para mostrar/ocultar precios especiales
  const [mostrarPreciosEspeciales, setMostrarPreciosEspeciales] = useState(false);

  // Modal para editar precio especial individual
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [modalPrecioUSD, setModalPrecioUSD] = useState<number | ''>('');
  const [modalActivo, setModalActivo] = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalUsarPrecioBase, setModalUsarPrecioBase] = useState(false);
  const [modalMargen, setModalMargen] = useState<number | ''>('');

  // Tipo de cambio oficial (USD -> ARS)
  const [tipoCambioOficial, setTipoCambioOficial] = useState<number | null>(null);

  const {
    productos: productosDisponiblesContext,
    loading: cargandoProductosContext,
    error: errorProductosContext,
  } = useProductsContext();

  const cargarDatosCompletosCliente = useCallback(async (clienteId: number) => {
    setIsLoading(true);
    setErrorCarga(null);
    setSubmitSuccessMessage(null);
    setSubmitErrorMessage(null);
    setForm(initialFormState); 
  // Eliminado: setPreciosEspecialesOriginales([]);

    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    if (!token) {
        setErrorCarga("No se encontró token de autenticación.");
        setIsLoading(false);
        return;
    }

    try {
      // 1. Cargar datos del cliente
  const resCliente = await fetch(`${API_BASE_URL}/clientes/obtener/${clienteId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resCliente.ok) {
        const errDataCliente = await resCliente.json().catch(() => ({}));
        throw new Error(errDataCliente.message || `Error al cargar datos del cliente: ${resCliente.statusText}`);
      }
      const datosCliente = await resCliente.json();

      // 2. Cargar precios especiales para este cliente
  const resPrecios = await fetch(`${API_BASE_URL}/precios_especiales/obtener-por-cliente/${clienteId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let preciosDelClienteApi: PrecioEspecialDesdeAPI[] = [];
      if (resPrecios.ok) {
        // LA API DEVUELVE DIRECTAMENTE EL ARRAY
        preciosDelClienteApi = await resPrecios.json(); 
       
      } else if (resPrecios.status !== 404) { 
        const errorDataPrecios = await resPrecios.json().catch(() => ({}));
        console.error("Error API al cargar precios especiales (status no 404):", errorDataPrecios);
        throw new Error(errorDataPrecios.message || `Error al cargar precios especiales: ${resPrecios.statusText}`);
      }

  // Mapear los datos de la API de precios al formato del formulario
      const preciosFormateados: ProductoPrecioEspecialItem[] = preciosDelClienteApi.map(p => ({
        id_precio_especial: p.id,                 // ID del registro de precio especial
        producto_id: String(p.producto_id),       // ID del producto (como string para el select)
        valor: parseFloat(p.precio_unitario_fijo_ars) || 0,
        activo: p.activo,
        api_producto_nombre: p.producto_nombre,    // Nombre del producto para mostrar
        api_producto_id_original_api: p.producto_id, // ID original del producto de la API de precios
  // Si la API retorna moneda/precio original, preferirla; si no, asumimos ARS
  moneda: (p.moneda_original && String(p.moneda_original).toUpperCase() === 'USD') ? 'USD' : 'ARS',
    precio_original: p.precio_original !== undefined ? Number(p.precio_original) : undefined,
        // Campos de margen
        usar_precio_base: p.usar_precio_base || false,
        margen_sobre_base: p.margen_sobre_base || undefined,
      }));  

  // Guardar copia original para comparar cambios en el submit
  setPreciosOriginales(preciosDelClienteApi.length > 0 ? preciosDelClienteApi : []);

      setForm({
        nombre_razon_social: datosCliente.nombre_razon_social || '',
        cuit: String(datosCliente.cuit || ''),
        direccion: datosCliente.direccion || '',
        localidad: datosCliente.localidad || '',
        provincia: datosCliente.provincia || '',
        codigo_postal: String(datosCliente.codigo_postal || ''),
        telefono: datosCliente.telefono || '',
        email: datosCliente.email || '',
        contacto_principal: datosCliente.contacto_principal || '',
        observaciones: datosCliente.observaciones || '',
        precios_especiales_form: preciosFormateados.length > 0 ? preciosFormateados : [],
      });
  // Eliminado: setPreciosEspecialesOriginales(preciosFormateados);
  setMostrarPreciosEspeciales(preciosFormateados.length > 0); // Mostrar sección si ya tiene precios

    } catch (error) {
      console.error("Error en cargarDatosCompletosCliente:", error);
      setErrorCarga(error instanceof Error ? error.message : "Error desconocido al cargar datos.");
    } finally {
      setIsLoading(false);
    }
  }, []); // id_cliente se maneja en el useEffect de abajo

  useEffect(() => {
    if (id_cliente) {
      cargarDatosCompletosCliente(id_cliente);
    } else {
      setErrorCarga("ID de cliente no válido.");
      setIsLoading(false);
    }
  }, [id_cliente, cargarDatosCompletosCliente]);

  // Cargar tipo de cambio Oficial cuando se muestran precios especiales
  useEffect(() => {
    const fetchTC = async () => {
      try {
        // Llamada sin Authorization para evitar preflight CORS si el endpoint es público
        const res = await fetch(`${API_BASE_URL}/tipos_cambio/obtener/Oficial`);
        if (!res.ok) throw new Error('No se pudo obtener el tipo de cambio');
        const data = await res.json();
        // data expected to have { nombre: 'Oficial', valor: number }
        setTipoCambioOficial(Number(data.valor));
      } catch {
        setTipoCambioOficial(null);
      }
    };

    if (mostrarPreciosEspeciales) fetchTC();
  }, [mostrarPreciosEspeciales]);


  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePrecioEspecialChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const list = [...form.precios_especiales_form];
    const currentItem = list[index];

    if (name === 'producto_id') {
      currentItem.producto_id = value;
    } else if (name === 'valor') {
      currentItem.valor = Number(value) || 0;
    } else if (name === 'moneda') {
      currentItem.moneda = (value as 'ARS' | 'USD') || 'ARS';
    } else if (name === 'nuevo_precio') {
      currentItem.nuevo_precio = value === '' ? undefined : Number(value);
    } else if (name === 'activo' && type === 'checkbox') {
      currentItem.activo = (e.target as HTMLInputElement).checked;
    } else if (name === 'usar_precio_base' && type === 'checkbox') {
      currentItem.usar_precio_base = (e.target as HTMLInputElement).checked;
      if (!currentItem.usar_precio_base) {
        currentItem.margen_sobre_base = undefined;
      }
    } else if (name === 'margen_sobre_base') {
      currentItem.margen_sobre_base = value === '' ? undefined : Number(value);
    } else if (name === 'activo' && type === 'checkbox') {
      currentItem.activo = (e.target as HTMLInputElement).checked;
    }
    setForm(prev => ({ ...prev, precios_especiales_form: list }));
  };

  const agregarPrecioEspecial = () => {
    setForm(prev => ({
      ...prev,
      precios_especiales_form: [
        ...prev.precios_especiales_form,
        { temp_key: Date.now().toString(), producto_id: '', valor: 0, activo: true, moneda: 'ARS', usar_precio_base: false }
      ]
    }));
  };

  const eliminarPrecioEspecial = (index: number) => {
    const list = [...form.precios_especiales_form];
    // const itemEliminado = list[index];
    list.splice(index, 1);
    setForm(prev => ({ ...prev, precios_especiales_form: list }));
    // Si itemEliminado tenía un id_precio_especial, la lógica de handleSubmit lo marcará para eliminación.
  };

  const [modalMoneda, setModalMoneda] = useState<'ARS' | 'USD'>('USD');

  const closeModal = () => {
    setModalOpen(false);
    setModalIndex(null);
    setModalPrecioUSD('');
    setModalActivo(true);
    setModalLoading(false);
    setModalError(null);
    setModalUsarPrecioBase(false);
    setModalMargen('');
    setModalMoneda('ARS');
  };

  const handleModalSave = async () => {
    if (modalIndex === null) return;
    if (!id_cliente) {
      setModalError('ID de cliente no disponible');
      return;
    }
    const item = form.precios_especiales_form[modalIndex];
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setModalError('No se encontró token');
      return;
    }
    setModalLoading(true);
    try {
      const precio = modalPrecioUSD === '' ? undefined : Number(modalPrecioUSD);
      // Actualizar item editado con todos los campos
      const updatedItem = { 
        ...item, 
        moneda: modalMoneda,
        usar_precio_base: modalUsarPrecioBase,
        margen_sobre_base: modalUsarPrecioBase && modalMargen !== '' ? Number(modalMargen) : undefined
      };
      // Si usar_precio_base=true (margin-based), precio_unitario_fijo_ars debe ser 0
      // Si usar_precio_base=false (fixed price), usar el precio según moneda
      const precioUnitarioARS = modalUsarPrecioBase ? 0 : (modalMoneda === 'USD' ? 0 : (precio !== undefined ? precio : 0));
      if (item.id_precio_especial) {
        // Update existing
        const payload: Record<string, unknown> = {
          activo: Boolean(modalActivo),
          moneda_original: modalMoneda,
          precio_unitario_fijo_ars: precioUnitarioARS,
          usar_precio_base: modalUsarPrecioBase,
          margen_sobre_base: modalUsarPrecioBase && modalMargen !== '' ? Number(modalMargen) / 100 : undefined,
        };
        if (precio !== undefined) {
          payload['precio_original'] = precio;
        }
  const res = await fetch(`${API_BASE_URL}/precios_especiales/editar/${item.id_precio_especial}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Error actualizando precio especial');
        }
      } else {
        // Create new precio especial for this producto
        if (!item.producto_id) throw new Error('Producto no seleccionado');
        const body: Record<string, unknown> = {
          cliente_id: id_cliente,
          producto_id: Number(item.producto_id),
          activo: Boolean(modalActivo),
          moneda_original: modalMoneda,
          precio_unitario_fijo_ars: precioUnitarioARS,
          usar_precio_base: modalUsarPrecioBase,
          margen_sobre_base: modalUsarPrecioBase && modalMargen !== '' ? Number(modalMargen) / 100 : undefined,
        };
        if (precio !== undefined) body['precio_original'] = precio;
  const res = await fetch(`${API_BASE_URL}/precios_especiales/crear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Error creando precio especial');
        }
      }
      // Actualizar moneda en el estado local
      const newForm = { ...form };
      newForm.precios_especiales_form[modalIndex] = updatedItem;
      setForm(newForm);
      // Recargar lista
      await cargarDatosCompletosCliente(id_cliente);
      closeModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setModalLoading(false);
    }
  };

  const handleModalDelete = async () => {
    if (modalIndex === null) return;
    const item = form.precios_especiales_form[modalIndex];
    if (!item.id_precio_especial) {
      // If it's a local new item, just remove from form
      eliminarPrecioEspecial(modalIndex);
      closeModal();
      return;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setModalError('No se encontró token');
      return;
    }
    setModalLoading(true);
    try {
  const res = await fetch(`${API_BASE_URL}/precios_especiales/eliminar/${item.id_precio_especial}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error eliminando precio especial');
      }
      if (id_cliente) await cargarDatosCompletosCliente(id_cliente);
      closeModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setModalLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id_cliente) {
      setSubmitErrorMessage("Error: No se puede actualizar sin un ID de cliente.");
      return;
    }
    setIsSubmitting(true);
    setSubmitSuccessMessage(null);
    setSubmitErrorMessage(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    if (!token) {
        setSubmitErrorMessage("Error: No se encontró token de autenticación.");
        setIsSubmitting(false);
        return;
    }

    const datosClienteActualizar = {
      nombre_razon_social: form.nombre_razon_social,
  // Solo agrega CUIT si no está vacío ni es null
  ...(form.cuit ? { cuit: form.cuit } : {}),
      direccion: form.direccion,
      localidad: form.localidad,
      provincia: form.provincia,
      codigo_postal: form.codigo_postal || null,
      telefono: form.telefono,
      email: form.email,
      contacto_principal: form.contacto_principal,
      observaciones: form.observaciones,
    };

    try {
  const resCliente = await fetch(`${API_BASE_URL}/clientes/actualizar/${id_cliente}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(datosClienteActualizar),
      });

      if (!resCliente.ok) {
        const errorData = await resCliente.json().catch(() => ({ message: "Error al actualizar el cliente." }));
        throw new Error(errorData.message || `Error ${resCliente.status} actualizando cliente`);
      }

      // Mostrar mensaje de éxito con detalles del cliente actualizado
      const clienteActualizado = await resCliente.json();
      setSubmitSuccessMessage(
        `Cliente actualizado correctamente.\n` +
        `Nombre/Razón Social: ${clienteActualizado.nombre_razon_social}\n` +
        `CUIT: ${clienteActualizado.cuit || '-'}\n` +
        `Dirección: ${clienteActualizado.direccion || '-'}\n` +
        `Localidad: ${clienteActualizado.localidad || '-'}\n` +
        `Email: ${clienteActualizado.email || '-'}`
      );

      // Sincronizar precios especiales
      // Comparar preciosOriginales (lo que vino de la API) con form.precios_especiales_form
      try {
        if (!preciosOriginales) {
          // No había precios originales cargados: crear todo lo que venga en el form
          const toCreateAll = form.precios_especiales_form.filter(i => !i.id_precio_especial && i.producto_id);
          for (const item of toCreateAll) {
            // Si el usuario ingresó un nuevo precio, preferirlo; si no, usar el precio actual/valor
            const nuevo = (typeof item.nuevo_precio === 'number' && Number.isFinite(item.nuevo_precio)) ? item.nuevo_precio : undefined;
            const body: Record<string, unknown> = {
              cliente_id: id_cliente,
              producto_id: Number(item.producto_id),
              precio_unitario_fijo_ars: item.usar_precio_base ? 0 : Number(item.valor),
              activo: Boolean(item.activo),
              usar_precio_base: !!item.usar_precio_base,
              margen_sobre_base: item.usar_precio_base && item.margen_sobre_base !== undefined ? Number(item.margen_sobre_base) / 100 : undefined,
            };
            body['moneda_original'] = item.moneda === 'USD' ? 'USD' : 'ARS';
            if (nuevo !== undefined) {
              // Si se ingresó nuevo precio, usarlo según la moneda seleccionada
              if (item.moneda === 'USD') {
                body['precio_original'] = nuevo;
              } else {
                // Solo actualizar precio_unitario_fijo_ars si no es margin-based
                if (!item.usar_precio_base) {
                  body['precio_unitario_fijo_ars'] = nuevo;
                }
                body['precio_original'] = nuevo;
              }
            } else {
              body['precio_original'] = item.precio_original !== undefined ? Number(item.precio_original) : Number(item.valor);
            }
            const resCrear = await fetch(`${API_BASE_URL}/precios_especiales/crear`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(body),
            });
            if (!resCrear.ok) {
              const err = await resCrear.json().catch(() => ({}));
              throw new Error(err.message || `Error al crear precio especial (producto ${item.producto_id})`);
            }
          }
        } else {
          // Calcular diffs
          const originalesById = new Map<number, PrecioEspecialDesdeAPI>();
          preciosOriginales.forEach(p => originalesById.set(p.id, p));

          // Items actuales que tienen id_precio_especial => posibles updates
          const toUpdate: { id: number; payload: Record<string, unknown> }[] = [];
          // Items actuales sin id => crear
          const toCreate: ProductoPrecioEspecialItem[] = [];
          // IDs originales que no están en el form => eliminar
          const actualesIds = new Set<number>();

          for (const item of form.precios_especiales_form) {
            if (item.id_precio_especial) {
              actualesIds.add(item.id_precio_especial);
              const orig = originalesById.get(item.id_precio_especial);
                if (!orig) {
                // No encontramos el original, tratar como update con lo que tengamos
                const nuevoUpd = (typeof item.nuevo_precio === 'number' && Number.isFinite(item.nuevo_precio)) ? item.nuevo_precio : undefined;
                const payload: Record<string, unknown> = {
                  precio_unitario_fijo_ars: item.usar_precio_base ? 0 : Number(item.valor),
                  activo: Boolean(item.activo),
                  usar_precio_base: !!item.usar_precio_base,
                  margen_sobre_base: item.usar_precio_base && item.margen_sobre_base !== undefined ? Number(item.margen_sobre_base) / 100 : undefined,
                };
                payload['moneda_original'] = item.moneda === 'USD' ? 'USD' : 'ARS';
                if (nuevoUpd !== undefined) {
                  if (item.moneda === 'USD') {
                    payload['precio_original'] = nuevoUpd;
                  } else {
                    // Solo actualizar precio_unitario_fijo_ars si no es margin-based
                    if (!item.usar_precio_base) {
                      payload['precio_unitario_fijo_ars'] = nuevoUpd;
                    }
                    payload['precio_original'] = nuevoUpd;
                  }
                } else {
                  payload['precio_original'] = item.precio_original !== undefined ? Number(item.precio_original) : Number(item.valor);
                }
                toUpdate.push({ id: item.id_precio_especial, payload });
              } else {
                // Comparar precio y activo. Si el usuario ingresó 'nuevo_precio' lo usamos para la comparación y para el payload.
                const origPrecio = Number(orig.precio_unitario_fijo_ars);
                const nuevoParaComparar = (typeof item.nuevo_precio === 'number' && Number.isFinite(item.nuevo_precio)) ? item.nuevo_precio : undefined;
                const curPrecio = nuevoParaComparar !== undefined ? Number(nuevoParaComparar) : Number(item.valor);
                const precioChanged = Math.abs((isNaN(origPrecio) ? 0 : origPrecio) - (isNaN(curPrecio) ? 0 : curPrecio)) > 0.0001;
                const activoChanged = Boolean(orig.activo) !== Boolean(item.activo);
                if (precioChanged || activoChanged) {
                  const payload: Record<string, unknown> = {
                    precio_unitario_fijo_ars: item.usar_precio_base ? 0 : Number(item.valor),
                    activo: Boolean(item.activo),
                    usar_precio_base: !!item.usar_precio_base,
                    margen_sobre_base: item.usar_precio_base && item.margen_sobre_base !== undefined ? Number(item.margen_sobre_base) / 100 : undefined,
                  };
                  payload['moneda_original'] = item.moneda === 'USD' ? 'USD' : 'ARS';
                  if (nuevoParaComparar !== undefined) {
                    if (item.moneda === 'USD') {
                      payload['precio_original'] = nuevoParaComparar;
                    } else {
                      // Solo actualizar precio_unitario_fijo_ars si no es margin-based
                      if (!item.usar_precio_base) {
                        payload['precio_unitario_fijo_ars'] = nuevoParaComparar;
                      }
                      payload['precio_original'] = nuevoParaComparar;
                    }
                  } else {
                    payload['precio_original'] = item.precio_original !== undefined ? Number(item.precio_original) : Number(item.valor);
                  }
                  toUpdate.push({ id: item.id_precio_especial, payload });
                }
              }
            } else {
              // Nuevo
              if (item.producto_id) toCreate.push(item);
            }
          }

          const toDelete: number[] = [];
          for (const orig of preciosOriginales) {
            if (!actualesIds.has(orig.id)) {
              toDelete.push(orig.id);
            }
          }

          // Ejecutar Creaciones
          for (const item of toCreate) {
            const nuevoCreate = (typeof item.nuevo_precio === 'number' && Number.isFinite(item.nuevo_precio)) ? item.nuevo_precio : undefined;
            const body: Record<string, unknown> = {
              cliente_id: id_cliente,
              producto_id: Number(item.producto_id),
              precio_unitario_fijo_ars: item.usar_precio_base ? 0 : Number(item.valor),
              activo: Boolean(item.activo),
              usar_precio_base: !!item.usar_precio_base,
              margen_sobre_base: item.usar_precio_base && item.margen_sobre_base !== undefined ? Number(item.margen_sobre_base) / 100 : undefined,
            };
            body['moneda_original'] = item.moneda === 'USD' ? 'USD' : 'ARS';
            if (nuevoCreate !== undefined) {
              if (item.moneda === 'USD') {
                body['precio_original'] = nuevoCreate;
              } else {
                // Solo actualizar precio_unitario_fijo_ars si no es margin-based
                if (!item.usar_precio_base) {
                  body['precio_unitario_fijo_ars'] = nuevoCreate;
                }
                body['precio_original'] = nuevoCreate;
              }
            } else {
              body['precio_original'] = item.precio_original !== undefined ? Number(item.precio_original) : Number(item.valor);
            }
            const resCrear = await fetch(`${API_BASE_URL}/precios_especiales/crear`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body)
            });
            if (!resCrear.ok) {
              const err = await resCrear.json().catch(() => ({}));
              throw new Error(err.message || `Error al crear precio especial (producto ${item.producto_id})`);
            }
          }

          // Ejecutar Updates
          for (const upd of toUpdate) {
            const resUpd = await fetch(`${API_BASE_URL}/precios_especiales/editar/${upd.id}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(upd.payload)
            });
            if (!resUpd.ok) {
              const err = await resUpd.json().catch(() => ({}));
              throw new Error(err.message || `Error al actualizar precio especial ID ${upd.id}`);
            }
          }

          // Ejecutar Deletes
          for (const idToDel of toDelete) {
            const resDel = await fetch(`${API_BASE_URL}/precios_especiales/eliminar/${idToDel}`, {
              method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resDel.ok) {
              const err = await resDel.json().catch(() => ({}));
              throw new Error(err.message || `Error al eliminar precio especial ID ${idToDel}`);
            }
          }
        }

        // Si todo OK, recargar datos del cliente para reflejar IDs nuevos y estado
        await cargarDatosCompletosCliente(id_cliente);
        setSubmitSuccessMessage(prev => (prev ? prev + '\nPrecios especiales sincronizados correctamente.' : 'Precios especiales sincronizados correctamente.'));
      } catch (errSync) {
        console.error('Error sincronizando precios especiales:', errSync);
        setSubmitErrorMessage(errSync instanceof Error ? errSync.message : 'Error desconocido sincronizando precios especiales.');
      }
    } catch (error) {
      setSubmitErrorMessage(error instanceof Error ? error.message : "Error desconocido al actualizar el cliente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="text-center p-10 text-white">Cargando datos del cliente...</div>;
  }
  if (errorCarga) {
    return <div className="text-center p-10 text-red-300 bg-red-900 bg-opacity-50 rounded-md">Error al cargar: {errorCarga}</div>;
  }

  

  return (
    <main className="min-h-screen bg-[#20119d] text-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white text-black p-6 rounded-lg shadow-xl">
        <BotonVolver className="ml-0" />
        <h1 className="text-3xl font-bold mb-6 text-center text-indigo-700">
          Actualizar Cliente (ID: {id_cliente})
        </h1>
        {submitSuccessMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert">{submitSuccessMessage}</div>}
        {submitErrorMessage && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">{submitErrorMessage}</div>}
  <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          {/* Campos del Cliente */}
          <fieldset className="border p-4 rounded-md">
            <legend className="text-xl font-semibold text-gray-700 px-2 mb-2">Datos del Cliente</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre o Razón Social <span className="text-red-600">(obligatorio)</span></label>
                <input type="text" name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CUIT <span className="text-gray-500">(opcional)</span></label>
                <input type="text" name="cuit" value={form.cuit} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: 20123456789"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Dirección <span className="text-gray-500">(opcional)</span></label>
                <input type="text" name="direccion" value={form.direccion} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Localidad <span className="text-red-600">(obligatorio)</span></label>
                <input type="text" name="localidad" value={form.localidad} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Provincia <span className="text-gray-500">(opcional)</span></label>
                <input type="text" name="provincia" value={form.provincia} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Código Postal <span className="text-gray-500">(opcional)</span></label>
                <input type="text" name="codigo_postal" value={form.codigo_postal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono <span className="text-gray-500">(opcional)</span></label>
                <input type="tel" name="telefono" value={form.telefono} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email <span className="text-gray-500">(opcional)</span></label>
                <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Contacto Principal <span className="text-gray-500">(opcional)</span></label>
                <input type="text" name="contacto_principal" value={form.contacto_principal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
            </div>
          </fieldset>

          {/* Botón para mostrar/ocultar sección de precios especiales */}
          {!mostrarPreciosEspeciales && (
            <button
              type="button"
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium shadow-sm"
              onClick={() => setMostrarPreciosEspeciales(true)}
            >
              + Precio Especial
            </button>
          )}

          {/* SECCIÓN DE PRECIOS ESPECIALES */}
          {mostrarPreciosEspeciales && (
            <fieldset className="border p-4 rounded-md mt-4">
              <legend className="text-xl font-semibold text-gray-700 px-2 mb-2">Precios Especiales</legend>
              <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] items-center gap-x-2 font-semibold text-sm text-gray-600 px-1 mb-1">
                <span>Producto</span>
                <span className="text-center">Precio Especial</span>
                <span className="text-center">Estado</span>
                <span className="text-center">Acciones</span>
              </div>
              <div className="space-y-4">
                {form.precios_especiales_form.length > 0 ? (
                  form.precios_especiales_form.map((item, index) => (
                    <div
                      key={item.id_precio_especial || item.temp_key || index}
                      className={`grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] items-start md:items-center gap-x-2 gap-y-2 px-2 py-2 border rounded-md ${item.id_precio_especial ? 'bg-yellow-50 border-yellow-300' : 'hover:bg-gray-50'}`}
                    >
                      {/* Columna: Producto */}
                      <div className="min-w-0 md:pr-2">
                        {item.id_precio_especial ? (
                          <div className="p-1">
                            <div className="text-sm md:text-base font-bold text-gray-800 truncate">
                              {item.api_producto_nombre || `Producto ${item.producto_id}`}
                            </div>
                            <input type="hidden" name="producto_id" value={item.producto_id} />
                          </div>
                        ) : (
                          <select
                            name="producto_id"
                            value={item.producto_id}
                            onChange={(e) => handlePrecioEspecialChange(index, e)}
                            className="w-full p-2 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            required
                            disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponiblesContext || productosDisponiblesContext.length === 0}
                          >
                            <option value="" disabled> -- Seleccionar Producto -- </option>
                            {cargandoProductosContext && <option disabled>Cargando productos...</option>}
                            {errorProductosContext && <option disabled>Error al cargar productos.</option>}
                            {!cargandoProductosContext && !errorProductosContext && productosDisponiblesContext && productosDisponiblesContext.length > 0 && (
                              productosDisponiblesContext.map((producto: Producto) => (
                                <option value={String(producto.id)} key={producto.id}>
                                  {producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}
                                </option>
                              ))
                            )}
                            {!cargandoProductosContext && !errorProductosContext && (!productosDisponiblesContext || productosDisponiblesContext.length === 0) && (
                              <option disabled>No hay productos disponibles</option>
                            )}
                          </select>
                        )}
                      </div>

                      {/* Columna: Precio Especial (Solo información) */}
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-medium text-gray-800">
                          {item.usar_precio_base ? (
                            (() => {
                              const margenPorcentaje = (item.margen_sobre_base || 0) * 100;
                              const esDescuento = margenPorcentaje < 0;
                              return (
                                <span className={esDescuento ? "text-orange-700" : "text-green-700"}>
                                  {esDescuento 
                                    ? `Precio base ${margenPorcentaje.toFixed(1)}% (descuento)`
                                    : `Precio base +${margenPorcentaje.toFixed(1)}% (margen)`
                                  }
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-blue-700">
                              ${Number(item.valor || 0).toFixed(2)} {item.moneda || 'ARS'}
                            </span>
                          )}
                        </div>
                        {item.moneda === 'USD' && tipoCambioOficial && !item.usar_precio_base && (
                          <div className="text-xs text-gray-500">
                            ≈ ARS ${(Number(item.valor || 0) * tipoCambioOficial).toFixed(2)}
                          </div>
                        )}
                        {item.usar_precio_base && item.producto_id && (
                          <div className="mt-2">
                            <PrecioPreviewConMargen 
                              productoId={item.producto_id} 
                              margen={(item.margen_sobre_base || 0) * 100} 
                            />
                          </div>
                        )}
                      </div>

                      {/* Columna: Estado */}
                      <div className="flex items-center justify-start md:justify-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {item.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      {/* Columna: Acciones */}
                      <div className="flex gap-2 items-center justify-start md:justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setModalIndex(index);
                            setModalPrecioUSD(item.precio_original !== undefined ? item.precio_original : item.valor);
                            setModalActivo(item.activo);
                            setModalMoneda(item.moneda || 'ARS');
                            setModalUsarPrecioBase(!!item.usar_precio_base);
                            // Convertir de decimal a porcentaje para el modal
                            const margenPorcentaje = item.margen_sobre_base !== undefined && item.margen_sobre_base !== null 
                              ? item.margen_sobre_base * 100 
                              : '';
                            setModalMargen(margenPorcentaje);
                            setModalOpen(true);
                          }}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-xs md:text-sm hover:bg-blue-700"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 px-3 py-2">No hay precios especiales definidos para este cliente. Puede agregar uno nuevo.</p>
                )}
              </div>
              <button
                type="button"
                onClick={agregarPrecioEspecial}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium shadow-sm disabled:opacity-60"
                disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponiblesContext || productosDisponiblesContext.length === 0}
              >
                + Agregar Nuevo Precio Especial
              </button>
              {/* Botón para ocultar sección */}
              <button
                type="button"
                className="ml-4 mt-4 bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 text-sm font-medium shadow-sm"
                onClick={() => setMostrarPreciosEspeciales(false)}
              >
                Ocultar Precios Especiales
              </button>
            </fieldset>
          )}

          <label className="block mt-4">
            <span className="text-sm font-medium text-gray-700">Observaciones</span>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" rows={3} />
          </label>

          <div className="flex justify-end mt-8">
            <button
              type="submit"
              className="bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-800 transition duration-150 ease-in-out disabled:opacity-50 text-lg"
              disabled={isLoading || isSubmitting}
            >
              {isSubmitting ? 'Actualizando...' : (isLoading ? 'Cargando...' : 'Guardar Cambios')}
            </button>
          </div>
          {/* Modal para editar precio especial */}
          {modalOpen && modalIndex !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white text-black rounded-md p-6 w-full max-w-lg">
                <h3 className="text-lg font-semibold mb-4">Editar Precio Especial</h3>
                {modalError && <div className="text-red-600 mb-2">{modalError}</div>}
                
                {/* Tipo de precio */}
                <div className="mb-4">
                  <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={modalUsarPrecioBase}
                      onChange={(e) => {
                        setModalUsarPrecioBase(e.target.checked);
                        if (!e.target.checked) {
                          setModalMargen('');
                        }
                      }}
                    />
                    <div>
                      <div className="font-medium">Usar precio base + margen</div>
                      <div className="text-sm text-gray-500">El precio se calcula dinámicamente basado en el precio base del producto</div>
                    </div>
                  </label>
                </div>

                {modalUsarPrecioBase ? (
                  /* Modo margen */
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Margen sobre precio base (%)
                    </label>
                    <input
                      type="number"
                      value={modalMargen === '' ? '' : modalMargen}
                      onChange={(e) => setModalMargen(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full p-2 border rounded mt-1"
                      placeholder="Ej: 25 (aumento) o -15 (descuento)"
                      step="0.01"
                      min="-100"
                      max="10000"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      💡 <strong>Ejemplos:</strong> 25 = +25% (aumento), -15 = -15% (descuento)
                      <br />
                      ⚠️ Límites: -100% a +10000% (descuento total máximo 100%)
                    </div>
                    {modalIndex !== null && form.precios_especiales_form[modalIndex]?.producto_id && modalMargen !== '' && (
                      <div className="mt-2">
                        <PrecioPreviewConMargen 
                          productoId={form.precios_especiales_form[modalIndex].producto_id} 
                          margen={Number(modalMargen)} 
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  /* Modo precio fijo */
                  <>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700">Moneda</label>
                      <select 
                        value={modalMoneda} 
                        onChange={e => setModalMoneda(e.target.value as 'ARS' | 'USD')} 
                        className="w-full p-2 border rounded mt-1"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700">Precio fijo ({modalMoneda})</label>
                      <input 
                        type="number" 
                        value={modalPrecioUSD === '' ? '' : modalPrecioUSD} 
                        onChange={(e) => setModalPrecioUSD(e.target.value === '' ? '' : Number(e.target.value))} 
                        className="w-full p-2 border rounded mt-1"
                        step="0.01"
                        min="0"
                        placeholder={`Precio en ${modalMoneda}`}
                      />
                      {modalMoneda === 'USD' && tipoCambioOficial && modalPrecioUSD !== '' && (
                        <div className="text-sm text-gray-500 mt-1">
                          ≈ ARS ${(Number(modalPrecioUSD) * tipoCambioOficial).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="mb-4 flex items-center gap-3">
                  <input 
                    id="modal-activo" 
                    type="checkbox" 
                    checked={modalActivo} 
                    onChange={(e) => setModalActivo(e.target.checked)} 
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="modal-activo" className="text-sm font-medium text-gray-700">Precio especial activo</label>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleModalDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                    Eliminar
                  </button>
                  <button 
                    type="button" 
                    onClick={handleModalSave} 
                    disabled={modalLoading} 
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {modalLoading ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}