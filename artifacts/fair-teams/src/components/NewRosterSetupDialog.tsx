import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileUp,
  Gamepad2,
  PencilRuler,
  Plus,
  Sparkles,
  Trophy,
} from "lucide-react";

import { PlayerModelSettings } from "@/components/PlayerModelSettings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translate } from "@/i18n";
import {
  createCustomRosterPlayerModel,
  customPlayerModelNeedsDefinition,
  type NewRosterSetupKind,
} from "@/lib/newRosterSetup";
import {
  createDefaultRosterPlayerModel,
  normalizeRosterPlayerModel,
  parsePresetPack,
  type RosterPlayerModel,
} from "@/lib/rosterPlayerModel";

function modeCardClass(selected: boolean) {
  return `relative rounded-3xl border p-4 text-left transition active:scale-[0.99] ${selected
    ? "border-primary/45 bg-primary/5 shadow-sm ring-2 ring-primary/10"
    : "border-border bg-background hover:border-primary/25 hover:bg-muted/20"}`;
}

function ModelSummary({ model }: { model: RosterPlayerModel }) {
  const safeModel = normalizeRosterPlayerModel(model);
  return (
    <div className="rounded-3xl border border-border bg-muted/20 p-3.5" data-testid="new-roster-model-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-foreground">
            {translate("app.newRoster.playerModel")}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {translate("app.newRoster.modelSummary", {
              attributes: safeModel.profileSize,
              count: safeModel.presets.length,
            })}
          </div>
        </div>
        <div className="rounded-full bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground shadow-sm">
          {translate(safeModel.profileSize === 3
            ? "roster.playerModel.threeAttributes"
            : "roster.playerModel.sixAttributes")}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {safeModel.attributes.map((attribute) => (
          <span
            key={attribute.id}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-black text-foreground"
          >
            {attribute.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function NewRosterSetupDialog({
  open,
  onOpenChange,
  defaultName,
  onCreate,
  onSavePackToGoogleDrive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreate: (setup: { name: string; playerModel: RosterPlayerModel }) => void;
  onSavePackToGoogleDrive?: (fileName: string, jsonText: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewRosterSetupKind>("football");
  const [model, setModel] = useState<RosterPlayerModel>(() => createDefaultRosterPlayerModel());
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelSettingsSection, setModelSettingsSection] = useState<"attributes" | "presets">("presets");
  const [importedPackName, setImportedPackName] = useState("");
  const [notice, setNotice] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("football");
    setModel(createDefaultRosterPlayerModel());
    setModelSettingsOpen(false);
    setModelSettingsSection("presets");
    setImportedPackName("");
    setNotice("");
  }, [open]);

  useEffect(() => {
    if (!open && !modelSettingsOpen) return;
    const handleNativeBack = (event: Event) => {
      event.preventDefault();
      if (modelSettingsOpen) {
        setModelSettingsOpen(false);
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener("fairteams:native-back", handleNativeBack);
    return () => window.removeEventListener("fairteams:native-back", handleNativeBack);
  }, [modelSettingsOpen, onOpenChange, open]);

  const safeModel = useMemo(() => normalizeRosterPlayerModel(model), [model]);
  const customNeedsDefinition = kind === "custom" && customPlayerModelNeedsDefinition(safeModel);
  const effectiveName = name.trim() || defaultName;

  const chooseFootball = () => {
    setKind("football");
    setModel(createDefaultRosterPlayerModel());
    setImportedPackName("");
    setNotice("");
  };

  const chooseCustom = () => {
    setKind("custom");
    setModel(createCustomRosterPlayerModel(3));
    setImportedPackName("");
    setNotice(translate("app.newRoster.customReadyNotice"));
  };

  const handleImport = async (file: File) => {
    try {
      const pack = parsePresetPack(await file.text());
      setKind("imported");
      setImportedPackName(pack.name);
      setModel(normalizeRosterPlayerModel({ ...pack.playerModel, presets: pack.presets }));
      setNotice(translate("app.newRoster.packReady", { name: pack.name }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : translate("roster.playerModel.importFailed"));
    }
  };

  const openModelSettings = (section: "attributes" | "presets") => {
    setModelSettingsSection(section);
    setModelSettingsOpen(true);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setModelSettingsOpen(false);
          onOpenChange(next);
        }}
      >
        <DialogContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="stripes-type-ui max-h-[94dvh] max-w-2xl overflow-y-auto rounded-3xl p-0"
          data-testid="new-roster-setup"
        >
          <div className="border-b border-border px-5 py-4">
            <DialogTitle className="text-xl font-black tracking-tight">
              {translate("app.newRoster.heading")}
            </DialogTitle>
            <p className="mt-1 text-xs font-semibold leading-snug text-muted-foreground">
              {translate("app.newRoster.description")}
            </p>
          </div>

          <div className="grid gap-5 p-4 sm:p-5">
            <div>
              <Label htmlFor="new-roster-name" className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                {translate("app.newRoster.nameLabel")}
              </Label>
              <Input
                id="new-roster-name"
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 36))}
                placeholder={defaultName}
                className="mt-1 h-12 rounded-2xl text-base font-black"
                maxLength={36}
                data-testid="new-roster-name"
              />
              <div className="mt-1 text-[10px] font-semibold text-muted-foreground">
                {translate("app.newRoster.nameFallback", { name: defaultName })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                {translate("app.newRoster.chooseSetup")}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={chooseFootball}
                  className={modeCardClass(kind === "football")}
                  aria-pressed={kind === "football"}
                  data-testid="new-roster-mode-football"
                >
                  {kind === "football" ? (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block text-sm font-black text-foreground">
                    {translate("app.newRoster.footballTitle")}
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold leading-snug text-muted-foreground">
                    {translate("app.newRoster.footballDescription")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={chooseCustom}
                  className={modeCardClass(kind === "custom")}
                  aria-pressed={kind === "custom"}
                  data-testid="new-roster-mode-custom"
                >
                  {kind === "custom" ? (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Gamepad2 className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block text-sm font-black text-foreground">
                    {translate("app.newRoster.customTitle")}
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold leading-snug text-muted-foreground">
                    {translate("app.newRoster.customDescription")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className={modeCardClass(kind === "imported")}
                  aria-pressed={kind === "imported"}
                  data-testid="new-roster-mode-import"
                >
                  {kind === "imported" ? (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <FileUp className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block text-sm font-black text-foreground">
                    {translate("app.newRoster.importTitle")}
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold leading-snug text-muted-foreground">
                    {kind === "imported" && importedPackName
                      ? importedPackName
                      : translate("app.newRoster.importDescription")}
                  </span>
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.stripes-presets.json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleImport(file);
                  }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-indigo-50/55 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-700 shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black text-[#102A43]">{translate("app.newRoster.ovrFirstTitle")}</div>
                  <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
                    {translate("app.newRoster.ovrFirstDescription")}
                  </div>
                </div>
              </div>
            </div>

            <ModelSummary model={safeModel} />

            {customNeedsDefinition ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-bold leading-snug text-amber-900">
                {translate("app.newRoster.customOvrOnlyReady")}
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-2xl border border-border bg-muted/25 px-3 py-2 text-[11px] font-bold leading-snug text-muted-foreground">
                {notice}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => openModelSettings(kind === "custom" ? "attributes" : "presets")}
                className="h-12 rounded-2xl font-black"
                data-testid="customize-new-roster-model"
              >
                <PencilRuler className="mr-2 h-4 w-4" />
                {translate(kind === "custom" ? "app.newRoster.defineModel" : "app.newRoster.customizeModel")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onCreate({ name: effectiveName, playerModel: safeModel });
                  onOpenChange(false);
                }}
                className="h-12 rounded-2xl font-black"
                data-testid="create-roster-submit"
              >
                <Plus className="mr-2 h-4 w-4" />
                {translate("app.newRoster.createAction")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PlayerModelSettings
        open={modelSettingsOpen}
        onOpenChange={setModelSettingsOpen}
        model={safeModel}
        rosterName={effectiveName}
        onSave={setModel}
        onSavePackToGoogleDrive={onSavePackToGoogleDrive}
        creationMode
        initialSection={modelSettingsSection}
      />
    </>
  );
}
