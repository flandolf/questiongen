import { Button } from "@/components/ui/button";

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({ open, title = "Confirm", description, confirmText = "Confirm", cancelText = "Cancel", onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-background border rounded-lg p-4 shadow-lg">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-2">{description}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>{cancelText}</Button>
            <Button variant="destructive" onClick={onConfirm}>{confirmText}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
