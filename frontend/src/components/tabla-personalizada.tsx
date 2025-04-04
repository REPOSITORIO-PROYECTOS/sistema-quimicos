"use client";

import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    type ColumnDef,
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import {
    ChevronDown,
    ChevronFirst,
    ChevronLast,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Loader2Icon,
    Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
} from "@/components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { FormularioItem } from "./formulario-item";

type Item = {
    id: string;
    tipo: string;
    estatus: string;
    descripcion: string;
    cotizacion: string;
    un: string;
};

const columns: ColumnDef<Item>[] = [
    {
        accessorKey: "id",
        header: "#",
        size: 60,
    },
    {
        accessorKey: "tipo",
        header: "Tipo",
        size: 120,
    },
    {
        accessorKey: "estatus",
        header: "Estatus",
        size: 120,
    },
    {
        accessorKey: "descripcion",
        header: "Descripción",
        size: 250,
    },
    {
        accessorKey: "cotizacion",
        header: "Cotización/Ajuste",
        size: 150,
    },
    {
        accessorKey: "un",
        header: "UN",
        size: 80,
    },
];

// Datos de ejemplo
const mockData: Item[] = [
    {
        id: "1",
        tipo: "Tipo A",
        estatus: "Activo",
        descripcion: "Descripción del item 1",
        cotizacion: "100.00",
        un: "PZA",
    },
    {
        id: "2",
        tipo: "Tipo B",
        estatus: "Inactivo",
        descripcion: "Descripción del item 2",
        cotizacion: "200.50",
        un: "KG",
    },
    {
        id: "3",
        tipo: "Tipo C",
        estatus: "Pendiente",
        descripcion: "Descripción del item 3",
        cotizacion: "150.75",
        un: "LT",
    },
    {
        id: "4",
        tipo: "Tipo A",
        estatus: "Activo",
        descripcion: "Descripción del item 4",
        cotizacion: "300.25",
        un: "PZA",
    },
    {
        id: "5",
        tipo: "Tipo B",
        estatus: "Inactivo",
        descripcion: "Descripción del item 5",
        cotizacion: "175.00",
        un: "MT",
    },
    {
        id: "6",
        tipo: "Tipo C",
        estatus: "Pendiente",
        descripcion: "Descripción del item 6",
        cotizacion: "225.50",
        un: "KG",
    },
    {
        id: "7",
        tipo: "Tipo A",
        estatus: "Activo",
        descripcion: "Descripción del item 7",
        cotizacion: "125.75",
        un: "PZA",
    },
    {
        id: "8",
        tipo: "Tipo B",
        estatus: "Inactivo",
        descripcion: "Descripción del item 8",
        cotizacion: "350.00",
        un: "LT",
    },
    {
        id: "9",
        tipo: "Tipo C",
        estatus: "Pendiente",
        descripcion: "Descripción del item 9",
        cotizacion: "275.25",
        un: "MT",
    },
    {
        id: "10",
        tipo: "Tipo A",
        estatus: "Activo",
        descripcion: "Descripción del item 10",
        cotizacion: "400.00",
        un: "PZA",
    },
];

export default function TablaPersonalizada() {
    const [data, setData] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
        {}
    );
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 10,
    });
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Simular carga de datos
    useEffect(() => {
        const timer = setTimeout(() => {
            setData(mockData);
            setIsLoading(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    // Filtrar datos basado en el término de búsqueda
    useEffect(() => {
        if (searchTerm) {
            const filteredData = mockData.filter(
                (item) =>
                    item.descripcion
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                    item.tipo
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                    item.estatus
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase())
            );
            setData(filteredData);
        } else {
            setData(mockData);
        }
    }, [searchTerm]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: setPagination,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            pagination,
        },
    });

    const handleAddItem = (newItem: Omit<Item, "id">) => {
        // Generar un nuevo ID (en una aplicación real, esto vendría del backend)
        const newId = (data.length + 1).toString();

        // Crear el nuevo item con el ID generado
        const itemToAdd: Item = {
            id: newId,
            ...newItem,
        };

        // Actualizar los datos
        setData((prevData) => [...prevData, itemToAdd]);

        // Cerrar el diálogo
        setIsDialogOpen(false);
    };

    return (
        <div className="space-y-4">
            {/* Barra de búsqueda y botón de agregar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Label htmlFor="search" className="sr-only">
                        Buscar
                    </Label>
                    <Input
                        id="search"
                        placeholder="Buscar..."
                        className="w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-800 hover:bg-indigo-700">
                            <Plus className="mr-2 h-4 w-4" />
                            Agregar Item
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Agregar Nuevo Item</DialogTitle>
                            <DialogDescription>
                                Complete el formulario para agregar un nuevo
                                item a la tabla.
                            </DialogDescription>
                        </DialogHeader>
                        <FormularioItem
                            onSubmit={handleAddItem}
                            onCancel={() => setIsDialogOpen(false)}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Tabla con borde azul/morado */}
            <div className="rounded-md border-2 border-indigo-800 overflow-hidden">
                <Table>
                    <TableHeader className="bg-indigo-800">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow
                                key={headerGroup.id}
                                className="hover:bg-transparent border-b-0"
                            >
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        className="text-white font-medium h-12 px-4"
                                    >
                                        {header.isPlaceholder ? null : (
                                            <div
                                                className={cn(
                                                    "flex items-center",
                                                    header.column.getCanSort() &&
                                                        "cursor-pointer select-none"
                                                )}
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext()
                                                )}
                                                {{
                                                    asc: (
                                                        <ChevronUp className="ml-2 h-4 w-4" />
                                                    ),
                                                    desc: (
                                                        <ChevronDown className="ml-2 h-4 w-4" />
                                                    ),
                                                }[
                                                    header.column.getIsSorted() as string
                                                ] ?? null}
                                            </div>
                                        )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    <div className="flex justify-center items-center">
                                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                        <span>Cargando...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row, index) => (
                                <TableRow
                                    key={row.id}
                                    className={cn(
                                        "border-b border-indigo-100",
                                        index % 2 === 0
                                            ? "bg-white"
                                            : "bg-indigo-50"
                                    )}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}
                                            className="px-4 py-3"
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No se encontraron resultados.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Label htmlFor="per-page">Mostrar</Label>
                    <Select
                        value={table.getState().pagination.pageSize.toString()}
                        onValueChange={(value) => {
                            table.setPageSize(Number(value));
                        }}
                    >
                        <SelectTrigger id="per-page" className="w-16">
                            <SelectValue
                                placeholder={
                                    table.getState().pagination.pageSize
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {[5, 10, 20, 30, 40, 50].map((pageSize) => (
                                <SelectItem
                                    key={pageSize}
                                    value={pageSize.toString()}
                                >
                                    {pageSize}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span>por página</span>
                </div>

                <div className="flex items-center justify-end space-x-2 py-4">
                    <div className="text-sm text-muted-foreground">
                        Página {table.getState().pagination.pageIndex + 1} de{" "}
                        {table.getPageCount()}
                    </div>
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => table.setPageIndex(0)}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    <ChevronFirst className="h-4 w-4" />
                                </Button>
                            </PaginationItem>
                            <PaginationItem>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            </PaginationItem>
                            <PaginationItem>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => table.nextPage()}
                                    disabled={!table.getCanNextPage()}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </PaginationItem>
                            <PaginationItem>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                        table.setPageIndex(
                                            table.getPageCount() - 1
                                        )
                                    }
                                    disabled={!table.getCanNextPage()}
                                >
                                    <ChevronLast className="h-4 w-4" />
                                </Button>
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            </div>
        </div>
    );
}
