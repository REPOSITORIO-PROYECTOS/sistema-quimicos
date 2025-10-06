import React from 'react';
import { Button } from '@/components/ui/button';
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

interface SelectionControlsProps {
  // Estados de selección
  isSelectMode: boolean;
  selectedItems: Set<string>;
  displayedItems: unknown[];
  
  // Estados de categorías
  categorias: CategoriaData[];
  isAssigningCategory: boolean;
  
  // Handlers
  onToggleSelectMode: () => void;
  onSelectAll: () => void;
  onAssignCategoryToSelected: (categoryId: number) => void;
  onRemoveCategoryFromSelected: () => void;
  // Optional actions menu node to render at the right side
  actionsMenu?: React.ReactNode;
}

export const SelectionControls: React.FC<SelectionControlsProps> = ({
  isSelectMode,
  selectedItems,
  displayedItems,
  categorias,
  isAssigningCategory,
  onToggleSelectMode,
  onSelectAll,
  onAssignCategoryToSelected,
  onRemoveCategoryFromSelected
  , actionsMenu
}) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4 p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-4">
        <Button
          onClick={onToggleSelectMode}
          variant={isSelectMode ? "destructive" : "outline"}
          size="sm"
          className="bg-white border-gray-200 text-gray-800"
        >
          {isSelectMode ? "Cancelar Selección" : "Seleccionar Productos"}
        </Button>
        
        {isSelectMode && (
          <>
            <Button onClick={onSelectAll} variant="outline" size="sm" className="bg-white border-gray-200 text-gray-800">
              {selectedItems.size === displayedItems.length ? "Deseleccionar Todo" : "Seleccionar Todo"}
            </Button>
            <span className="text-sm text-gray-600">
              {selectedItems.size} productos seleccionados
            </span>
          </>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        {isSelectMode && selectedItems.size > 0 && (
          <div className="flex flex-wrap gap-2">
            <Select onValueChange={(value) => onAssignCategoryToSelected(parseInt(value))}>
            <SelectTrigger className="w-48 bg-white">
              <SelectValue placeholder="Asignar categoría" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((categoria) => (
                <SelectItem key={categoria.id} value={categoria.id.toString()}>
                  {categoria.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={onRemoveCategoryFromSelected}
            variant="outline"
            size="sm"
            disabled={isAssigningCategory}
          >
            {isAssigningCategory ? "Procesando..." : "Quitar Categoría"}
          </Button>
          </div>
        )}

        {/* actions menu on the right side when provided */}
        {actionsMenu && (
          <div className="ml-2">
            {actionsMenu}
          </div>
        )}
      </div>
    </div>
  );
};