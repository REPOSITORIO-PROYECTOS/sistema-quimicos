import React from 'react';
import { Button } from '@/components/ui/button';

import { Label } from '@/components/ui/label';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

interface AssignByNamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  namesText: string;
  setNamesText: (text: string) => void;
  selectedCategory: number | null;
  setSelectedCategory: (categoryId: number | null) => void;
  usePartialMatch: boolean;
  setUsePartialMatch: (usePartial: boolean) => void;
  categorias: CategoriaData[];
  isAssigning: boolean;
  error: string | null;
  result: {total_productos_actualizados: number; resultados: {productos_encontrados: {nombre: string; categoria_anterior?: string}[]; productos_no_encontrados: string[]}[]} | null;
}

export const AssignByNamesModal: React.FC<AssignByNamesModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  namesText,
  setNamesText,
  selectedCategory,
  setSelectedCategory,
  usePartialMatch,
  setUsePartialMatch,
  categorias,
  isAssigning,
  error,
  result
}) => {
  const handleClose = () => {
    setNamesText('');
    setSelectedCategory(null);
    setUsePartialMatch(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asignar Categoría por Nombres</DialogTitle>
          <DialogDescription>
            Pega una lista de nombres de productos (uno por línea) y selecciona la categoría a asignar.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="category-select">
              Categoría a asignar
            </Label>
            <Select 
              value={selectedCategory?.toString() || ""} 
              onValueChange={(value) => setSelectedCategory(value ? parseInt(value) : null)}
              disabled={isAssigning}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id.toString()}>
                    {categoria.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="names-textarea">
              Lista de nombres de productos
            </Label>
            <textarea
              id="names-textarea"
              value={namesText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNamesText(e.target.value)}
              placeholder="Producto A&#10;Producto B&#10;Producto C&#10;..."
              className="min-h-32 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={6}
              disabled={isAssigning}
            />
            <p className="text-xs text-gray-500">
              Pega los nombres de productos, uno por línea
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="partial-match"
              checked={usePartialMatch}
              onChange={(e) => setUsePartialMatch(e.target.checked)}
              disabled={isAssigning}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <Label htmlFor="partial-match" className="text-sm">
              Usar coincidencia parcial (buscar productos que contengan el texto)
            </Label>
          </div>
          
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {result && (
            <div className="text-sm bg-green-50 p-3 rounded">
              <h4 className="font-medium text-green-800 mb-2">Resultados:</h4>
              <p className="text-green-700">
                ✅ {result.total_productos_actualizados} productos actualizados
              </p>
              {result.resultados && result.resultados[0] && (
                <div className="mt-2 space-y-1">
                  {result.resultados[0].productos_no_encontrados?.length > 0 && (
                    <div className="text-amber-700">
                      ⚠️ No encontrados: {result.resultados[0].productos_no_encontrados.join(', ')}
                    </div>
                  )}
                  {result.resultados[0].productos_encontrados?.length > 0 && (
                    <details className="text-green-700">
                      <summary className="cursor-pointer">
                        Ver productos actualizados ({result.resultados[0].productos_encontrados.length})
                      </summary>
                      <ul className="mt-1 ml-4 text-xs">
                        {result.resultados[0].productos_encontrados.slice(0, 10).map((producto: {nombre: string; categoria_anterior?: string}, idx: number) => (
                          <li key={idx}>
                            {producto.nombre} 
                            {producto.categoria_anterior && ` (era: ${producto.categoria_anterior})`}
                          </li>
                        ))}
                        {result.resultados[0].productos_encontrados.length > 10 && (
                          <li className="italic">
                            ...y {result.resultados[0].productos_encontrados.length - 10} más
                          </li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleClose}
            disabled={isAssigning}
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button 
              type="submit" 
              onClick={onSubmit}
              disabled={!namesText.trim() || !selectedCategory || isAssigning}
            >
              {isAssigning ? 'Asignando...' : 'Asignar Categoría'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};