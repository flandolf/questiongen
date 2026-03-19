import { Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { Target } from "lucide-react";
import { StudentAnswerImage } from "../../types";

type WrittenAnswerCardProps = {
  questionId: string;
  answer: string;
  image: StudentAnswerImage | undefined;
  isMarking: boolean;
  canSubmit: boolean;
  onAnswerChange: (value: string) => void;
  onImageDrop: (files: File[]) => void;
  onImageRemove: () => void;
  onSubmit: () => void;
};

export function WrittenAnswerCard({
  answer,
  image,
  isMarking,
  canSubmit,
  onAnswerChange,
  onImageDrop,
  onImageRemove,
  onSubmit,
}: WrittenAnswerCardProps) {
  return (
    <Card className="shadow-md border-border/50 flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Target className="w-5 h-5 text-primary" /> Your Response
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 flex-1 flex flex-col">
        <div className="flex-1 flex flex-col gap-6">
          <div className="space-y-3 flex-1">
            <Label className="text-base font-semibold">Type your answer</Label>
            <Textarea
              placeholder="Compose your response here..."
              className="min-h-[200px] resize-y text-base p-4 focus-visible:ring-primary/30"
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={isMarking}
            />
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Or upload working (Image)</Label>
            {image ? (
              <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 shadow-sm bg-muted/30 p-2">
                <img
                  src={image.dataUrl}
                  alt="Uploaded text"
                  className="w-full h-auto max-h-80 object-contain rounded-lg"
                />
                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                  <Button variant="destructive" size="sm" className="shadow-xl" onClick={onImageRemove}>
                    <Trash2 className="w-4 h-4 mr-2" /> Remove Image
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl hover:bg-muted/30 transition-colors">
                <Dropzone onDrop={onImageDrop} />
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="w-full mt-auto h-14 text-base font-bold shadow-md transition-all hover:shadow-primary/20"
            onClick={onSubmit}
            disabled={!canSubmit || isMarking}
          >
            {isMarking
              ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Evaluating Answer...</>
              : <><CheckCircle2 className="w-5 h-5 mr-2" /> Submit for Marking</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
