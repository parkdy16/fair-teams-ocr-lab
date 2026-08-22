import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  FileUp,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import { translate, type TranslationKey } from "@/i18n";
import { downloadText, type RoomPlayer } from "@/lib/localRoster";
import {
  customPlayerModelNeedsDefinition,
  isCustomRosterPlayerModel,
  playerModelAttributeIssue,
  resizeCustomRosterPlayerModel,
  rosterPlayerModelAttributesLocked,
} from "@/lib/newRosterSetup";
import {
  cloneRosterPlayerModel,
  createPresetDraft,
  importPresetPackIntoModel,
  normalizeRosterPlayerModel,
  parsePresetPack,
  playerAttributeIdFromLabel,
  playerModelAttributesMatch,
  presetPackFilename,
  removePreset,
  resizeRosterPlayerModel,
  reorderPreset,
  resetPlayerRatingsForModel,
  serializePresetPack,
  upsertPreset,
  type PlayerPresetPack,
  type RosterPlayerModel,
  type RosterPlayerPreset,
} from "@/lib/rosterPlayerModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StripesConfirmContent } from "@/components/ui/stripes-modal";
import { PlayerPresetIcon, PLAYER_PRESET_ICON_OPTIONS } from "@/components/playerPresetIcons";

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function presetChartData(model: RosterPlayerModel, preset: RosterPlayerPreset) {
  const average = model.attributes.reduce(
    (sum, attribute) => sum + preset.offsets[attribute.slot],
    0,
  ) / Math.max(1, model.attributes.length);
  return model.attributes.map((attribute) => ({
    attribute: attribute.label,
    value: Math.max(1, Math.min(10, 5 + preset.offsets[attribute.slot] - average)),
  }));
}

function PresetEditor({
  open,
  onOpenChange,
  model,
  initialPreset,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: RosterPlayerModel;
  initialPreset: RosterPlayerPreset | null;
  onSave: (preset: RosterPlayerPreset) => void;
}) {
  const [draft, setDraft] = useState<RosterPlayerPreset>(() => createPresetDraft(model));

  useEffect(() => {
    if (!open) return;
    setDraft(initialPreset
      ? { ...initialPreset, offsets: { ...initialPreset.offsets } }
      : createPresetDraft(model));
  }, [initialPreset, model, open]);

  const chartData = useMemo(() => presetChartData(model, draft), [draft, model]);
  const presetValidationKey = useMemo<TranslationKey | "">(() => {
    const name = draft.name.trim().toLocaleLowerCase();
    if (!name) return "roster.playerModel.presetNameRequired";
    const duplicate = model.presets.some((presetItem) =>
      presetItem.id !== initialPreset?.id
      && presetItem.name.trim().toLocaleLowerCase() === name,
    );
    if (duplicate) return "roster.playerModel.presetNameDuplicate";
    const values = model.attributes.map((attribute) => draft.offsets[attribute.slot]);
    const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const hasShape = values.some((value) => Math.abs(value - average) >= 0.5);
    return hasShape ? "" : "roster.playerModel.presetShapeRequired";
  }, [draft, initialPreset?.id, model]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="stripes-type-ui max-h-[92dvh] max-w-2xl overflow-y-auto rounded-3xl p-0"
        data-testid="preset-editor"
      >
        <div className="border-b border-border px-5 py-4">
          <DialogTitle className="text-xl font-black tracking-tight">
            {initialPreset ? translate("roster.playerModel.editPreset") : translate("roster.playerModel.createPreset")}
          </DialogTitle>
          <p className="mt-1 text-xs font-semibold leading-snug text-muted-foreground">
            {translate("roster.playerModel.presetEditorHelp")}
          </p>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[0.9fr_1.1fr] sm:p-5">
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                {translate("roster.playerModel.presetName")}
              </Label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value.slice(0, 40) }))}
                className="mt-1 h-11 rounded-2xl font-black"
                maxLength={40}
                placeholder={translate("roster.playerModel.presetNamePlaceholder")}
                data-testid="preset-name"
              />
            </div>

            <div>
              <Label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                {translate("roster.playerModel.presetDescription")}
              </Label>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value.slice(0, 160) }))}
                className="mt-1 min-h-20 w-full resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                maxLength={160}
              />
            </div>

            <div>
              <Label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                {translate("roster.playerModel.chooseIcon")}
              </Label>
              <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8">
                {PLAYER_PRESET_ICON_OPTIONS.map((iconKey) => {
                  const selected = draft.iconKey === iconKey;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, iconKey }))}
                      className={`flex aspect-square items-center justify-center rounded-2xl border transition active:scale-95 ${selected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
                      aria-label={translate("roster.playerModel.chooseIconNamed", { icon: iconKey })}
                      aria-pressed={selected}
                    >
                      <PlayerPresetIcon iconKey={iconKey} className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="h-52 rounded-3xl border border-border bg-muted/20 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData} outerRadius="70%">
                  <PolarGrid stroke="#dbe5ef" />
                  <PolarAngleAxis dataKey="attribute" tick={{ fill: "#52677c", fontSize: 10, fontWeight: 800 }} />
                  <PolarRadiusAxis domain={[1, 10]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.24} strokeWidth={2.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-[10px] font-semibold leading-snug text-indigo-800">
              {translate("roster.playerModel.presetNormalizationHelp")}
            </div>

            <div className="grid gap-2">
              {model.attributes.map((attribute) => {
                const offset = draft.offsets[attribute.slot];
                return (
                  <label key={attribute.id} className="rounded-2xl border border-border bg-background px-3 py-2.5 shadow-sm">
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-black text-foreground">{attribute.label}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
                        {offset > 0 ? `+${offset}` : offset}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={-4}
                      max={4}
                      step={0.5}
                      value={offset}
                      onChange={(event) => {
                        const next = roundHalf(Number(event.target.value));
                        setDraft((current) => ({
                          ...current,
                          offsets: { ...current.offsets, [attribute.slot]: next },
                        }));
                      }}
                      className="fairteams-slider mt-2 w-full"
                      aria-label={translate("roster.playerModel.presetAttributeAria", { attribute: attribute.label })}
                    />
                    <span className="mt-1 flex justify-between text-[9px] font-black uppercase tracking-wide text-muted-foreground/70">
                      <span>{translate("roster.playerModel.weaker")}</span>
                      <span>{translate("roster.playerModel.typical")}</span>
                      <span>{translate("roster.playerModel.stronger")}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {presetValidationKey ? (
          <div className="mx-4 mb-1 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-900 sm:mx-5">
            {translate(presetValidationKey)}
          </div>
        ) : null}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl font-black">
            {translate("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (presetValidationKey) return;
              onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
              onOpenChange(false);
            }}
            disabled={Boolean(presetValidationKey)}
            className="rounded-2xl font-black"
            data-testid="save-preset"
          >
            <Save className="mr-2 h-4 w-4" />
            {translate("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PlayerModelSettings({
  open,
  onOpenChange,
  model,
  players = [],
  rosterName,
  onSave,
  onResetPlayers,
  onSavePackToGoogleDrive,
  creationMode = false,
  sharedRoster = false,
  initialSection = "presets",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: RosterPlayerModel;
  players?: RoomPlayer[];
  rosterName: string;
  onSave: (model: RosterPlayerModel) => void;
  onResetPlayers?: (players: RoomPlayer[]) => void;
  onSavePackToGoogleDrive?: (fileName: string, jsonText: string) => Promise<void>;
  creationMode?: boolean;
  sharedRoster?: boolean;
  initialSection?: "attributes" | "presets";
}) {
  const [draft, setDraft] = useState(() => cloneRosterPlayerModel(model));
  const [section, setSection] = useState<"attributes" | "presets">("presets");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingPreset, setEditingPreset] = useState<RosterPlayerPreset | null>(null);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingReplacementPack, setPendingReplacementPack] = useState<PlayerPresetPack | null>(null);
  const [pendingDeletePreset, setPendingDeletePreset] = useState<RosterPlayerPreset | null>(null);
  const [resetPlayersOnSave, setResetPlayersOnSave] = useState(false);
  const [savingToDrive, setSavingToDrive] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const attributesLocked = !creationMode && rosterPlayerModelAttributesLocked(players, sharedRoster);
  const attributeIssue = playerModelAttributeIssue(draft);
  const needsAttributeDefinition = customPlayerModelNeedsDefinition(draft);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneRosterPlayerModel(model));
    setSelectedIds([]);
    setNotice("");
    setResetPlayersOnSave(false);
    setPendingReplacementPack(null);
    setPendingDeletePreset(null);
    setPresetEditorOpen(false);
    setEditingPreset(null);
    setSection(initialSection);
  }, [initialSection, model, open]);

  const allSelected = draft.presets.length > 0 && selectedIds.length === draft.presets.length;

  const toggleSelected = (presetId: string) => {
    setSelectedIds((current) => current.includes(presetId)
      ? current.filter((id) => id !== presetId)
      : [...current, presetId]);
  };

  const updateAttribute = (index: number, field: "label" | "description", value: string) => {
    const currentAttribute = draft.attributes[index];
    const changesMeaning = field === "label"
      && Boolean(currentAttribute)
      && value.trim() !== currentAttribute.label.trim();
    if (changesMeaning && draft.presets.length) {
      setNotice(translate("roster.playerModel.presetsRemovedForAttributeChange"));
    }
    setDraft((current) => {
      const attributes = current.attributes.map((attribute, attributeIndex) => {
        if (attributeIndex !== index) return attribute;
        const nextValue = value.slice(0, field === "label" ? 36 : 160);
        if (field !== "label") return { ...attribute, description: nextValue };
        if (attribute.id.startsWith("custom-attribute-")) {
          // Keep the portable stable ID while the organizer gives a custom
          // attribute its human meaning during setup.
          return { ...attribute, label: nextValue };
        }
        const baseId = playerAttributeIdFromLabel(nextValue, `attribute-${index + 1}`);
        const usedIds = new Set(current.attributes.filter((_, otherIndex) => otherIndex !== index).map((item) => item.id));
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        return { ...attribute, id, label: nextValue };
      });
      return {
        ...current,
        attributes,
        presets: changesMeaning ? [] : current.presets,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const changeProfileSize = (profileSize: 3 | 6) => {
    if (attributesLocked) return;
    const nextBase = isCustomRosterPlayerModel(draft)
      ? resizeCustomRosterPlayerModel(draft, profileSize)
      : resizeRosterPlayerModel(draft, profileSize);
    setDraft(nextBase);
    setSelectedIds([]);
  };

  const exportSelected = async (toDrive: boolean) => {
    if (!selectedIds.length) {
      setNotice(translate("roster.playerModel.selectPresetsFirst"));
      return;
    }
    const fileName = presetPackFilename(`${rosterName}-presets`);
    const jsonText = serializePresetPack(draft, selectedIds, `${rosterName} presets`);
    if (!toDrive) {
      downloadText(fileName, jsonText, "application/json");
      setNotice(translate("roster.playerModel.exportedCount", { count: selectedIds.length }));
      return;
    }
    if (!onSavePackToGoogleDrive) return;
    setSavingToDrive(true);
    try {
      await onSavePackToGoogleDrive(fileName, jsonText);
      setNotice(translate("roster.playerModel.savedToDrive", { count: selectedIds.length }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : translate("roster.playerModel.driveSaveFailed"));
    } finally {
      setSavingToDrive(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const pack = parsePresetPack(await file.text());
      if (playerModelAttributesMatch(draft, pack.playerModel)) {
        setDraft(importPresetPackIntoModel(draft, pack));
        setNotice(translate("roster.playerModel.importedCount", { count: pack.presets.length }));
      } else if (creationMode) {
        setDraft(normalizeRosterPlayerModel({ ...pack.playerModel, presets: pack.presets }));
        setSelectedIds([]);
        setNotice(translate("roster.playerModel.replacedCreationModel"));
      } else if (sharedRoster) {
        setNotice(translate("roster.playerModel.sharedResetDeferred"));
      } else {
        setPendingReplacementPack(pack);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : translate("roster.playerModel.importFailed"));
    }
  };

  const commitModelReplacement = () => {
    const pack = pendingReplacementPack;
    if (!pack) return;
    const nextModel = normalizeRosterPlayerModel({ ...pack.playerModel, presets: pack.presets });
    setDraft(nextModel);
    setResetPlayersOnSave(true);
    setSelectedIds([]);
    setPendingReplacementPack(null);
    setNotice(translate("roster.playerModel.modelReplacedRatingsReset"));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="stripes-type-ui max-h-[94dvh] max-w-3xl overflow-y-auto rounded-3xl p-0"
          data-testid="player-model-settings"
        >
          <div className="border-b border-border px-5 py-4">
            <DialogTitle className="text-xl font-black tracking-tight">
              {translate("roster.playerModel.heading")}
            </DialogTitle>
            <p className="mt-1 text-xs font-semibold leading-snug text-muted-foreground">
              {translate("roster.playerModel.description")}
            </p>
          </div>

          <div className="flex gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
            {(["presets", "attributes"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSection(value)}
                className={`rounded-full px-4 py-2 text-xs font-black transition ${section === value ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {translate(value === "presets" ? "roster.playerModel.presetsTab" : "roster.playerModel.attributesTab")}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-5">
            {section === "attributes" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-foreground">{translate("roster.playerModel.profileShape")}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                        {translate("roster.playerModel.profileShapeHelp")}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-background p-1 shadow-sm">
                      {[3, 6].map((size) => (
                        <button
                          key={size}
                          type="button"
                          disabled={attributesLocked}
                          onClick={() => changeProfileSize(size as 3 | 6)}
                          className={`rounded-xl px-4 py-2 text-xs font-black ${draft.profileSize === size ? "bg-primary text-primary-foreground" : "text-muted-foreground"} disabled:opacity-40`}
                        >
                          {translate(size === 3 ? "roster.playerModel.threeAttributes" : "roster.playerModel.sixAttributes")}
                        </button>
                      ))}
                    </div>
                  </div>
                  {attributesLocked ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-800">
                      {translate("roster.playerModel.attributesLocked")}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {draft.attributes.map((attribute, index) => (
                    <div key={attribute.slot} className="rounded-2xl border border-border bg-background p-3 shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                        {translate("roster.playerModel.attributeNumber", { number: index + 1 })}
                      </div>
                      <Input
                        value={attribute.label}
                        onChange={(event) => updateAttribute(index, "label", event.target.value)}
                        disabled={attributesLocked}
                        className="mt-2 h-10 rounded-xl font-black"
                        maxLength={36}
                        data-testid={`player-model-attribute-${index + 1}`}
                      />
                      <textarea
                        value={attribute.description}
                        onChange={(event) => updateAttribute(index, "description", event.target.value)}
                        disabled={attributesLocked}
                        className="mt-2 min-h-16 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold outline-none disabled:opacity-50"
                        maxLength={160}
                      />
                    </div>
                  ))}
                </div>
                {attributeIssue ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-900">
                    {translate(attributeIssue === "missing"
                      ? "roster.playerModel.attributeLabelsRequired"
                      : "roster.playerModel.attributeLabelsUnique")}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-foreground">{translate("roster.playerModel.presetLibrary")}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                      {translate("roster.playerModel.presetLibraryHelp", { count: draft.presets.length })}
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={needsAttributeDefinition}
                    onClick={() => {
                      setEditingPreset(null);
                      setPresetEditorOpen(true);
                    }}
                    className="h-10 rounded-2xl font-black"
                    title={needsAttributeDefinition ? translate("roster.playerModel.defineAttributesBeforePreset") : undefined}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {translate("roster.playerModel.createPreset")}
                  </Button>
                </div>

                {needsAttributeDefinition ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-900">
                    {translate("roster.playerModel.defineAttributesBeforePreset")}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/20 p-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(allSelected ? [] : draft.presets.map((item) => item.id))}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] font-black text-foreground"
                  >
                    {translate(allSelected ? "roster.playerModel.clearSelection" : "roster.playerModel.selectAll")}
                  </button>
                  <Button type="button" variant="outline" onClick={() => void exportSelected(false)} className="h-9 rounded-xl px-3 text-[11px] font-black">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {translate("roster.playerModel.exportSelected")}
                  </Button>
                  {onSavePackToGoogleDrive ? (
                    <Button type="button" variant="outline" disabled={savingToDrive} onClick={() => void exportSelected(true)} className="h-9 rounded-xl px-3 text-[11px] font-black">
                      <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                      {translate("roster.playerModel.saveToDrive")}
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] font-black text-foreground"
                  >
                    <FileUp className="mr-1.5 inline h-3.5 w-3.5" />
                    {translate("roster.playerModel.importPack")}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json,.stripes-presets.json,application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void handleImportFile(file);
                    }}
                  />
                  <span className="ml-auto text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                    {translate("roster.playerModel.selectedCount", { count: selectedIds.length })}
                  </span>
                </div>

                {draft.presets.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs font-semibold text-muted-foreground">
                    {translate("roster.playerModel.emptyPresetLibrary")}
                  </div>
                ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.presets.map((presetItem, index) => {
                    const selected = selectedIds.includes(presetItem.id);
                    return (
                      <div
                        key={presetItem.id}
                        className={`rounded-2xl border p-2.5 transition ${selected ? "border-primary/45 bg-primary/5" : "border-border bg-background"}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleSelected(presetItem.id)}
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/30 text-muted-foreground"}`}
                            aria-pressed={selected}
                            aria-label={translate("roster.playerModel.selectPresetAria", { preset: presetItem.name })}
                          >
                            {selected ? <Check className="h-4 w-4" /> : <PlayerPresetIcon iconKey={presetItem.iconKey} className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPreset(presetItem);
                              setPresetEditorOpen(true);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-black text-foreground">{presetItem.name}</span>
                            <span className="mt-0.5 line-clamp-2 block text-[10px] font-semibold leading-snug text-muted-foreground">{presetItem.description}</span>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <button type="button" disabled={index === 0} onClick={() => setDraft(reorderPreset(draft, presetItem.id, -1))} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20" aria-label={translate("roster.playerModel.movePresetUp")}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" disabled={index === draft.presets.length - 1} onClick={() => setDraft(reorderPreset(draft, presetItem.id, 1))} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20" aria-label={translate("roster.playerModel.movePresetDown")}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1 border-t border-border/70 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPreset(createPresetDraft(draft, presetItem));
                              setPresetEditorOpen(true);
                            }}
                            className="rounded-lg px-2 py-1 text-[10px] font-black text-muted-foreground hover:bg-muted"
                          >
                            <Copy className="mr-1 inline h-3 w-3" />
                            {translate("roster.playerModel.duplicate")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeletePreset(presetItem)}
                            className="rounded-lg px-2 py-1 text-[10px] font-black text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="mr-1 inline h-3 w-3" />
                            {translate("common.remove")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {notice ? (
              <div className="mt-4 rounded-2xl border border-border bg-muted/25 px-3 py-2 text-[11px] font-bold leading-snug text-muted-foreground">
                {notice}
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl font-black">
              {translate("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (attributeIssue) return;
                const next = normalizeRosterPlayerModel(draft);
                if (resetPlayersOnSave) onResetPlayers?.(resetPlayerRatingsForModel(players));
                onSave(next);
                onOpenChange(false);
              }}
              disabled={Boolean(attributeIssue)}
              className="rounded-2xl font-black"
              data-testid="save-player-model"
            >
              <Save className="mr-2 h-4 w-4" />
              {translate("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PresetEditor
        open={presetEditorOpen}
        onOpenChange={setPresetEditorOpen}
        model={draft}
        initialPreset={editingPreset}
        onSave={(presetItem) => setDraft((current) => upsertPreset(current, presetItem))}
      />

      <AlertDialog open={pendingReplacementPack !== null} onOpenChange={(next) => { if (!next) setPendingReplacementPack(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("roster.playerModel.replaceModelHeading")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("roster.playerModel.replaceModelDescription")}
              <span className="mt-2 block font-bold">
                {translate("roster.playerModel.resetKeepsPlayers", { count: players.length })}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={commitModelReplacement}>
              {translate("roster.playerModel.replaceAndReset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>

      <AlertDialog open={pendingDeletePreset !== null} onOpenChange={(next) => { if (!next) setPendingDeletePreset(null); }}>
        <StripesConfirmContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate("roster.playerModel.deletePreset")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate("roster.playerModel.deletePresetDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translate("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeletePreset) return;
                const presetId = pendingDeletePreset.id;
                setDraft((current) => removePreset(current, presetId));
                setSelectedIds((current) => current.filter((id) => id !== presetId));
                setPendingDeletePreset(null);
              }}
            >
              {translate("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </StripesConfirmContent>
      </AlertDialog>
    </>
  );
}
