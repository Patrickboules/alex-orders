"use client";

import { useState } from "react";
import { MenuEditor } from "@/components/admin/menu-editor";
import { MenuUpload } from "@/components/admin/menu-upload";
import type { Menu, MenuStatus, SourceFile } from "@/lib/types";

/** Upload when there is no menu yet; otherwise the review editor with a way back to upload. */
export function MenuWorkspace({
  restaurantId,
  menu,
  menuStatus,
  sourceFiles,
  version,
}: {
  restaurantId: string;
  menu: Menu | null;
  menuStatus: MenuStatus;
  sourceFiles: SourceFile[];
  version: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const hasMenu = menu !== null && menu.categories.length > 0;

  if (!hasMenu) return <MenuUpload restaurantId={restaurantId} />;
  if (uploading) return <MenuUpload restaurantId={restaurantId} onCancel={() => setUploading(false)} />;

  return (
    <MenuEditor
      // `version` changes when the stored menu changes (new parse or save), resetting the editor.
      key={version}
      restaurantId={restaurantId}
      initialMenu={menu}
      menuStatus={menuStatus}
      sourceFiles={sourceFiles}
      onReupload={() => {
        setNotice(null);
        setUploading(true);
      }}
      notice={notice}
      onNotice={setNotice}
    />
  );
}
