"use client";

import type React from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { useEffect } from 'react';

// fetch categories
async function fetchCategorias(token: string | null) {
    if (!token) return [];
    try {
        const res = await fetch('https://quimex.sistemataup.online/categorias/?activo=true', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return [];
        const data = await res.json();
        return data.categorias || [];
    } catch (e) { console.error('Error fetching categorias', e); return []; }
}

type ItemFormData = {
    tipo: string;
    estatus: string;
    descripcion: string;
    cotizacion: string;
    un: string;
    categoriaId?: string;
};

type FormularioItemProps = {
    onSubmit: (data: ItemFormData) => void;
    onCancel: () => void;
    initialData?: Partial<ItemFormData>;
};

export function FormularioItem({ onSubmit, onCancel, initialData }: FormularioItemProps) {
    const [formData, setFormData] = useState<ItemFormData>({
        tipo: initialData?.tipo || "",
        estatus: initialData?.estatus || "",
        descripcion: initialData?.descripcion || "",
        cotizacion: initialData?.cotizacion || "",
        un: initialData?.un || "",
        categoriaId: initialData?.categoriaId ?? '0',
    });

    const [categorias, setCategorias] = useState<{id:number;nombre:string}[]>([]);

    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        fetchCategorias(token).then(setCategorias);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="tipo" className="text-right">
                        Tipo
                    </Label>
                    <div className="col-span-3">
                        <Select
                            value={formData.tipo}
                            onValueChange={(value) =>
                                handleSelectChange("tipo", value)
                            }
                            required
                        >
                            <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Tipo A">Tipo A</SelectItem>
                                <SelectItem value="Tipo B">Tipo B</SelectItem>
                                <SelectItem value="Tipo C">Tipo C</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="estatus" className="text-right">
                        Estatus
                    </Label>
                    <div className="col-span-3">
                        <Select
                            value={formData.estatus}
                            onValueChange={(value) =>
                                handleSelectChange("estatus", value)
                            }
                            required
                        >
                            <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Seleccionar estatus" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Activo">Activo</SelectItem>
                                <SelectItem value="Inactivo">
                                    Inactivo
                                </SelectItem>
                                <SelectItem value="Pendiente">
                                    Pendiente
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="descripcion" className="text-right">
                        Descripción
                    </Label>
                    <Input
                        id="descripcion"
                        name="descripcion"
                        value={formData.descripcion}
                        onChange={handleChange}
                        className="col-span-3"
                        required
                    />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="cotizacion" className="text-right">
                        Cotización/Ajuste
                    </Label>
                    <Input
                        id="cotizacion"
                        name="cotizacion"
                        value={formData.cotizacion}
                        onChange={handleChange}
                        type="number"
                        step="0.01"
                        min="0"
                        className="col-span-3"
                        required
                    />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="un" className="text-right">
                        UN
                    </Label>
                    <div className="col-span-3">
                        <div className="mb-2">
                            <label className="block text-xs text-gray-600 mb-1">Categoría (opcional)</label>
                            <Select value={formData.categoriaId || ''} onValueChange={(v) => handleSelectChange("categoriaId", v)}>
                                    <SelectTrigger className="bg-white">
                                        <SelectValue placeholder="Seleccionar categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">Sin categoría</SelectItem>
                                        {categorias.map(c => (<SelectItem key={c.id} value={c.id.toString()}>{c.nombre}</SelectItem>))}
                                    </SelectContent>
                            </Select>
                        </div>
                        <Select
                            value={formData.un}
                            onValueChange={(value) =>
                                handleSelectChange("un", value)
                            }
                            required
                        >
                            <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Seleccionar unidad" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PZA">PZA</SelectItem>
                                <SelectItem value="KG">KG</SelectItem>
                                <SelectItem value="LT">LT</SelectItem>
                                <SelectItem value="MT">MT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    className="bg-indigo-800 hover:bg-indigo-700"
                >
                    Guardar
                </Button>
            </DialogFooter>
        </form>
    );
}
