<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->

<!--
  Component gallery: a developer tool that shows every shadcn-vue component
  the app uses (docs/ui-stack.md) in the light and dark themes, so that a
  change to the theme or to a component can be checked at a glance.

  It is only part of development builds: App.vue loads it behind
  `import.meta.env.DEV`, so `pnpm build` and `pnpm tauri build` leave it out.
  Because it never reaches users, its sample text is not translated.

  Each component has a section marked `data-gallery-component="<name>"`, and
  the theme button is marked `data-gallery-theme-toggle`; the acceptance
  tests (tests/acceptance/t0-8-*.spec.ts) find them by these attributes.
-->
<script setup lang="ts">
import { MoonIcon, SunIcon } from "@lucide/vue";
import { VisAxis, VisGroupedBar, VisXYContainer } from "@unovis/vue";
import { useForm } from "vee-validate";
import { ref } from "vue";
import { toast } from "vue-sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from "@/components/ui/chart";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// --- Theme -------------------------------------------------------------------

// shadcn-vue's dark theme is the `dark` class on <html> (src/styles/tokens.css).
// The gallery starts in whichever theme the document is in.
const isDark = ref(document.documentElement.classList.contains("dark"));

function toggleTheme(): void {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("dark", isDark.value);
}

// --- Sample data -------------------------------------------------------------

const strict = ref(true);

const blocklists = ["Social media", "News", "Games"];

const installedApps = ["Discord", "Steam", "Spotify", "Telegram"];

const history = Array.from(
  { length: 30 },
  (_, index) => `Session ${index + 1}`,
);

const sidebarItems = ["Timer", "Blocklists", "History", "Settings"];

interface FocusDay {
  day: number;
  minutes: number;
}

const focusDays: FocusDay[] = [
  { day: 1, minutes: 75 },
  { day: 2, minutes: 120 },
  { day: 3, minutes: 50 },
  { day: 4, minutes: 150 },
  { day: 5, minutes: 100 },
];

const chartConfig = {
  // --chart-1 is the focus color (src/styles/tokens.css).
  minutes: { label: "Focus minutes", color: "var(--chart-1)" },
} satisfies ChartConfig;

const tooltipTemplate = componentToString(chartConfig, ChartTooltipContent);

// --- Form ----------------------------------------------------------------------

// VeeValidate with a plain validation function per field. Zod schemas
// (docs/ui-stack.md, "Forms") come with the app's first real form.
interface BlocklistForm {
  name: string;
}

const { handleSubmit } = useForm<BlocklistForm>({
  initialValues: { name: "" },
  validationSchema: {
    name: (value: unknown) =>
      (typeof value === "string" && value.trim() !== "") ||
      "Give the blocklist a name.",
  },
});

const onSubmit = handleSubmit((values) => {
  toast(`Saved "${values.name}"`);
});
</script>

<template>
  <TooltipProvider>
    <main class="bg-background text-foreground min-h-screen p-6">
      <header class="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">Component gallery</h1>
          <p class="text-muted-foreground text-sm">
            Development builds only. Every shadcn-vue component in
            docs/ui-stack.md.
          </p>
        </div>
        <Button
          variant="outline"
          data-gallery-theme-toggle
          :aria-pressed="isDark"
          @click="toggleTheme"
        >
          <MoonIcon v-if="!isDark" aria-hidden="true" />
          <SunIcon v-else aria-hidden="true" />
          Dark theme
        </Button>
      </header>

      <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <!-- Bastion's own tokens and fonts (src/styles/tokens.css,
             fonts.css), which no shadcn-vue component shows. -->
        <section
          aria-labelledby="gallery-tokens"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 id="gallery-tokens" class="font-medium">Design tokens</h2>
          <div class="flex flex-wrap gap-2 text-sm font-medium">
            <span
              class="bg-primary text-primary-foreground rounded-md px-3 py-1"
            >
              Focus
            </span>
            <span class="bg-break text-break-foreground rounded-md px-3 py-1">
              Break
            </span>
            <span class="bg-strict text-strict-foreground rounded-md px-3 py-1">
              Strict
            </span>
          </div>
          <p class="flex flex-wrap gap-x-2 text-sm">
            <span>Geist 400</span>
            <span class="font-medium">500</span>
            <span class="font-semibold">600</span>
            <span class="font-bold">700</span>
            <span class="text-muted-foreground">Muted text</span>
          </p>
          <p class="font-mono text-4xl font-medium tabular-nums">25:00</p>
        </section>

        <section
          data-gallery-component="button"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Button</h2>
          <div class="flex flex-wrap gap-2">
            <Button>Start</Button>
            <Button variant="secondary">Skip break</Button>
            <Button variant="outline">Edit</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Remove</Button>
            <Button disabled>Stop</Button>
          </div>
        </section>

        <section
          data-gallery-component="card"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Card</h2>
          <Card>
            <CardHeader>
              <CardTitle>Strict mode is on</CardTitle>
              <CardDescription>
                The session cannot be stopped until 14:25.
              </CardDescription>
            </CardHeader>
            <CardContent>18 blocked attempts this session.</CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">Details</Button>
            </CardFooter>
          </Card>
        </section>

        <section
          data-gallery-component="input"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Input</h2>
          <Input aria-label="Website" placeholder="example.com" />
          <Input aria-label="Disabled website" disabled value="news.example" />
        </section>

        <section
          data-gallery-component="label"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Label</h2>
          <div class="grid gap-2">
            <Label for="gallery-label-input">Executable</Label>
            <Input id="gallery-label-input" placeholder="steam.exe" />
          </div>
        </section>

        <section
          data-gallery-component="switch"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Switch</h2>
          <div class="flex items-center gap-2">
            <Switch id="gallery-switch" v-model="strict" />
            <Label for="gallery-switch">Strict mode</Label>
          </div>
        </section>

        <section
          data-gallery-component="select"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Select</h2>
          <Select default-value="Social media">
            <SelectTrigger aria-label="Blocklist" class="w-48">
              <SelectValue placeholder="Choose a blocklist" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="name in blocklists" :key="name" :value="name">
                {{ name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section
          data-gallery-component="dialog"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Dialog</h2>
          <Dialog>
            <DialogTrigger as-child>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit blocklist</DialogTitle>
                <DialogDescription>
                  Changes apply to the next session.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose as-child>
                  <Button>Done</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>

        <section
          data-gallery-component="alert-dialog"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Alert dialog</h2>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button>Start strict session</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start a strict session?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will not be able to stop it before 14:25.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Start</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        <section
          data-gallery-component="tabs"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Tabs</h2>
          <Tabs default-value="sites">
            <TabsList>
              <TabsTrigger value="sites">Sites</TabsTrigger>
              <TabsTrigger value="apps">Apps</TabsTrigger>
              <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            </TabsList>
            <TabsContent value="sites">youtube.com, reddit.com</TabsContent>
            <TabsContent value="apps">steam.exe</TabsContent>
            <TabsContent value="exceptions">docs.example.com</TabsContent>
          </Tabs>
        </section>

        <section
          data-gallery-component="badge"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Badge</h2>
          <div class="flex flex-wrap gap-2">
            <Badge>Focus</Badge>
            <Badge variant="secondary">Short break</Badge>
            <Badge variant="outline">Long break</Badge>
            <Badge variant="destructive">Blocked</Badge>
          </div>
        </section>

        <section
          data-gallery-component="separator"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Separator</h2>
          <p class="text-sm">Focus 25 min</p>
          <Separator />
          <div class="flex h-5 items-center gap-3 text-sm">
            <span>Cycle 2 of 4</span>
            <Separator orientation="vertical" />
            <span>Break 5 min</span>
          </div>
        </section>

        <section
          data-gallery-component="tooltip"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Tooltip</h2>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="outline">Stop</Button>
            </TooltipTrigger>
            <TooltipContent>Strict mode: stopping is disabled.</TooltipContent>
          </Tooltip>
        </section>

        <section
          data-gallery-component="sonner"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Sonner</h2>
          <Button variant="outline" @click="toast('Session started')">
            Show a toast
          </Button>
          <Toaster />
        </section>

        <section
          data-gallery-component="scroll-area"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Scroll area</h2>
          <ScrollArea class="h-32 rounded-md border">
            <ul class="p-3 text-sm">
              <li v-for="item in history" :key="item" class="py-1">
                {{ item }}
              </li>
            </ul>
          </ScrollArea>
        </section>

        <section
          data-gallery-component="dropdown-menu"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Dropdown menu</h2>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline">Open menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Session</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Start focus</DropdownMenuItem>
              <DropdownMenuItem>Open blocklists</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Quit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>

        <section
          data-gallery-component="command"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Command</h2>
          <Command class="rounded-lg border">
            <CommandInput placeholder="Search applications" />
            <CommandList>
              <CommandEmpty>No applications found.</CommandEmpty>
              <CommandGroup heading="Installed">
                <CommandItem
                  v-for="app in installedApps"
                  :key="app"
                  :value="app"
                >
                  {{ app }}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section
          data-gallery-component="form"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Form</h2>
          <form class="space-y-3" @submit="onSubmit">
            <FormField v-slot="{ componentField }" name="name">
              <FormItem>
                <FormLabel>Blocklist name</FormLabel>
                <FormControl>
                  <Input placeholder="Social media" v-bind="componentField" />
                </FormControl>
                <FormDescription>Shown in the timer screen.</FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>
            <Button type="submit">Save</Button>
          </form>
        </section>

        <section
          data-gallery-component="number-field"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Number field</h2>
          <NumberField
            id="gallery-number-field"
            :default-value="25"
            :min="1"
            :max="120"
          >
            <Label for="gallery-number-field">Focus minutes</Label>
            <NumberFieldContent>
              <NumberFieldDecrement />
              <NumberFieldInput />
              <NumberFieldIncrement />
            </NumberFieldContent>
          </NumberField>
        </section>

        <section
          data-gallery-component="chart"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Chart</h2>
          <ChartContainer :config="chartConfig" class="h-40">
            <VisXYContainer :data="focusDays">
              <VisGroupedBar
                :x="(d: FocusDay) => d.day"
                :y="(d: FocusDay) => d.minutes"
                :color="chartConfig.minutes.color"
              />
              <VisAxis type="x" :grid-line="false" />
              <VisAxis type="y" :grid-line="false" />
              <ChartTooltip />
              <ChartCrosshair
                :template="tooltipTemplate"
                :x="(d: FocusDay) => d.day"
                :y="(d: FocusDay) => d.minutes"
                :color="chartConfig.minutes.color"
              />
            </VisXYContainer>
          </ChartContainer>
        </section>

        <section
          data-gallery-component="sidebar"
          class="space-y-3 rounded-xl border p-4"
        >
          <h2 class="font-medium">Sidebar</h2>
          <!-- `collapsible="none"` renders the sidebar in place, instead of
               fixed to the window's edge as the app's own sidebar will be. -->
          <SidebarProvider class="min-h-0">
            <Sidebar collapsible="none" class="rounded-lg border">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Keitora</SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuItem v-for="item in sidebarItems" :key="item">
                      <SidebarMenuButton :is-active="item === 'Timer'">
                        {{ item }}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
          </SidebarProvider>
        </section>
      </div>
    </main>
  </TooltipProvider>
</template>
