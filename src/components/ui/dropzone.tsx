 
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn } from "../../lib/utils";

interface DropzoneProps {
  onDrop: (acceptedFiles: File[]) => void;
  className?: string;
  maxSize?: number;
  accept?: Record<string, string[]>;
}

export function Dropzone({ onDrop, className, maxSize = 8 * 1024 * 1024, accept = { "image/*": [] } }: DropzoneProps) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    maxSize,
    accept,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-200 min-h-40",
        isDragActive && !isDragReject ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        isDragReject && "border-destructive bg-destructive/5 text-destructive",
        className
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className={cn("w-10 h-10 mb-4 text-muted-foreground", isDragActive && "text-primary")} />
      {isDragReject ? (
        <p className="font-medium">File type not accepted</p>
      ) : isDragActive ? (
        <p className="font-medium text-primary">Drop the image here ...</p>
      ) : (
        <div className="space-y-1">
          <p className="font-medium">Drag & drop your answer image here, or click to select</p>
          <p className="text-sm text-muted-foreground">Supported format: Images up to 8MB</p>
        </div>
      )}
    </div>
  );
}
