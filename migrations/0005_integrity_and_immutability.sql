-- Hand-written (drizzle-kit generate --custom): what a module's tables.ts can't express, because a
-- module never imports another module's tables (.claude/rules/file-structure-and-imports.md).
-- TechDesign/data-model.md is the design target for everything below.

-- 1. Foreign keys across modules. The first migration created only the ones a single module could
--    declare, so a decision could name a jurisdiction that doesn't exist and a report could name a
--    decision that doesn't. Each is checked against existing rows when it is added.
ALTER TABLE "decision" ADD CONSTRAINT "decision_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdiction"("id");--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_profile_version_id_profile_version_id_fk" FOREIGN KEY ("profile_version_id") REFERENCES "profile_version"("id");--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_profile_change_id_profile_change_id_fk" FOREIGN KEY ("profile_change_id") REFERENCES "profile_change"("id");--> statement-breakpoint
ALTER TABLE "analysis_run_dataset" ADD CONSTRAINT "analysis_run_dataset_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "dataset_version"("id");--> statement-breakpoint
ALTER TABLE "evidence_resolution" ADD CONSTRAINT "evidence_resolution_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "evidence_resolution" ADD CONSTRAINT "evidence_resolution_mapped_by_dataset_version_id_fk" FOREIGN KEY ("mapped_by") REFERENCES "dataset_version"("id");--> statement-breakpoint
ALTER TABLE "evidence_resolution" ADD CONSTRAINT "evidence_resolution_not_mapped_by_dataset_version_id_fk" FOREIGN KEY ("not_mapped_by") REFERENCES "dataset_version"("id");--> statement-breakpoint
ALTER TABLE "phase_review" ADD CONSTRAINT "phase_review_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "decision"("id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_run"("id");--> statement-breakpoint
ALTER TABLE "jurisdiction_dataset" ADD CONSTRAINT "jurisdiction_dataset_jurisdiction_id_jurisdiction_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdiction"("id");--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_current_version_id_dataset_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "dataset_version"("id");--> statement-breakpoint
ALTER TABLE "jurisdiction" ADD CONSTRAINT "jurisdiction_current_profile_version_id_profile_version_id_fk" FOREIGN KEY ("current_profile_version_id") REFERENCES "profile_version"("id");--> statement-breakpoint
ALTER TABLE "profile_change" ADD CONSTRAINT "profile_change_base_version_id_profile_version_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "profile_version"("id");--> statement-breakpoint

-- 2. Indexes. Version numbers are unique per project and only released rows have one. The GiST
--    index makes every spatial predicate over evidence features an index scan.
CREATE UNIQUE INDEX "report_one_version" ON "report" USING btree ("decision_id","version_number") WHERE "version_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "evidence_feature_geom" ON "evidence_feature" USING gist ("geom");--> statement-breakpoint

-- 3. Immutability, in the database, so it holds for any connection and any future code path
--    (TechDesign/data-model.md, "Privileges and immutability").
CREATE FUNCTION forbid_final_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% % is final and cannot change', TG_TABLE_NAME, OLD.id;
END $$;--> statement-breakpoint
CREATE FUNCTION forbid_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% rows cannot be % (append-only)', TG_TABLE_NAME, lower(TG_OP);
END $$;--> statement-breakpoint

-- Rows that reached a final state stay as they are.
CREATE TRIGGER "analysis_run_final" BEFORE UPDATE ON "analysis_run"
	FOR EACH ROW WHEN (OLD.status <> 'running') EXECUTE FUNCTION forbid_final_row_change();--> statement-breakpoint
CREATE TRIGGER "dataset_version_final" BEFORE UPDATE ON "dataset_version"
	FOR EACH ROW WHEN (OLD.status <> 'ingesting') EXECUTE FUNCTION forbid_final_row_change();--> statement-breakpoint
CREATE TRIGGER "report_final" BEFORE UPDATE ON "report"
	FOR EACH ROW WHEN (OLD.status <> 'releasing') EXECUTE FUNCTION forbid_final_row_change();--> statement-breakpoint

-- A report still being released may change only the columns the release job sets (F22).
CREATE FUNCTION report_releasing_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.decision_id IS DISTINCT FROM OLD.decision_id
		OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
		OR NEW.analysis_run_id IS DISTINCT FROM OLD.analysis_run_id
		OR NEW.template_version IS DISTINCT FROM OLD.template_version
		OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
		OR NEW.change_note IS DISTINCT FROM OLD.change_note
		OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
		OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
		RAISE EXCEPTION 'report % may change only status, pdf, pdf_sha256, released_at, version_number and error_detail while releasing', OLD.id;
	END IF;
	RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "report_releasing_columns" BEFORE UPDATE ON "report"
	FOR EACH ROW WHEN (OLD.status = 'releasing') EXECUTE FUNCTION report_releasing_columns();--> statement-breakpoint

-- Nothing is deleted. A published document, a review, a resolution, a geometry revision, and a
-- profile version are records other records depend on.
CREATE TRIGGER "report_no_delete" BEFORE DELETE ON "report"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "analysis_run_no_delete" BEFORE DELETE ON "analysis_run"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "phase_review_append_only" BEFORE UPDATE OR DELETE ON "phase_review"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "evidence_resolution_append_only" BEFORE UPDATE OR DELETE ON "evidence_resolution"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "decision_geometry_append_only" BEFORE UPDATE OR DELETE ON "decision_geometry"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "analysis_run_dataset_append_only" BEFORE UPDATE OR DELETE ON "analysis_run_dataset"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();--> statement-breakpoint
CREATE TRIGGER "profile_version_append_only" BEFORE UPDATE OR DELETE ON "profile_version"
	FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
