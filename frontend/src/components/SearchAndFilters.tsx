import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CategoriaData {
  id: number;
  nombre: string;
  descripcion?: string | null;
}

interface SearchAndFiltersProps {
  // Estados de búsqueda y filtros
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedCategoriaFilter: number | null;
  setSelectedCategoriaFilter: (categoryId: number | null) => void;
  
  // Datos de categorías
  categorias: CategoriaData[];
}

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  selectedCategoriaFilter,
  setSelectedCategoriaFilter,
  categorias
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
      <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
        <input 
          type="text" 
          placeholder="Buscar por nombre o código..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
          className="px-4 py-2 border rounded-md w-full sm:w-64"
        />
        <Select 
          value={selectedCategoriaFilter?.toString() || "all"} 
          onValueChange={(value) => setSelectedCategoriaFilter(value === "all" ? null : parseInt(value))}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            <SelectItem value="0">Sin categoría</SelectItem>
            {categorias.map((categoria) => (
              <SelectItem key={categoria.id} value={categoria.id.toString()}>
                {categoria.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};