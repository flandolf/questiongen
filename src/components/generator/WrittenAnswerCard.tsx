import { Loader2, Trash2, CheckCircle2, ImageIcon, Type } from "lucide-react";
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

function wordCount(s: string) {
  const t = s.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

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
  const words = wordCount(answer);
  const hasContent = answer.trim().length > 0 || Boolean(image);

  return (
    <Card className="shadow-md border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="w-4.5 h-4.5 text-primary" /> Your Response
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Text answer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-muted-foreground" /> Written answer
            </Label>
            {words > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {words} {words === 1 ? "word" : "words"}
              </span>
            )}
          </div>
          <Textarea
            placeholder="Write your answer here..."
            className="min-h-[180px] resize-y text-sm p-3.5 focus-visible:ring-primary/30 leading-relaxed"
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            disabled={isMarking}
          />
        </div>

        {/* Divider with "or" */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        {/* Image upload */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" /> Upload working
          </Label>
          {image ? (
            <div className="relative group rounded-xl overflow-hidden border-2 border-primary/20 bg-muted/20 p-2">
              <img
                src={image.dataUrl}
                alt="Uploaded working"
                className="w-full h-auto max-h-72 object-contain rounded-lg"
              />
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center rounded-xl">
                <Button variant="destructive" size="sm" className="gap-1.5 shadow-lg" onClick={onImageRemove}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border/60 rounded-xl hover:border-primary/40 hover:bg-muted/20 transition-colors">
              <Dropzone onDrop={onImageDrop} />
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          size="lg"
          className={`w-full h-12 text-sm font-bold gap-2 transition-all duration-200 ${
            hasContent && !isMarking ? "shadow-md hover:shadow-primary/20 hover:-translate-y-0.5" : ""
          }`}
          onClick={onSubmit}
          disabled={!canSubmit || isMarking}
        >
          {isMarking ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating…</>
          ) : (
            <><CheckCircle2 className="w-4 h-4" /> Submit for Marking</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
