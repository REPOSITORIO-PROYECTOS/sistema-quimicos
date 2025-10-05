import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  categoryName: string;
  setCategoryName: (name: string) => void;
  categoryDescription: string;
  setCategoryDescription: (description: string) => void;
  isCreating: boolean;
  error: string | null;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  categoryName,
  setCategoryName,
  categoryDescription,
  setCategoryDescription,
  isCreating,
  error
}) => {
  const handleClose = () => {
    setCategoryName('');
    setCategoryDescription('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Categoría</DialogTitle>
          <DialogDescription>
            Crear una nueva categoría para organizar los productos.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category-name" className="text-right">
              Nombre
            </Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="col-span-3"
              placeholder="Nombre de la categoría"
              disabled={isCreating}
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category-description" className="text-right">
              Descripción
            </Label>
            <Input
              id="category-description"
              value={categoryDescription}
              onChange={(e) => setCategoryDescription(e.target.value)}
              className="col-span-3"
              placeholder="Descripción (opcional)"
              disabled={isCreating}
            />
          </div>
          
          {error && (
            <div className="col-span-4 text-sm text-red-600 mt-2">
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleClose}
            disabled={isCreating}
          >
            Cancelar
          </Button>
          <Button 
            type="submit" 
            onClick={onSubmit}
            disabled={!categoryName.trim() || isCreating}
          >
            {isCreating ? 'Creando...' : 'Crear Categoría'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};